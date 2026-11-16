/**
 * October file sorter (plan 2026-11-15-october-excel-reconciliation.md, the READY/PENDING brief).
 * This replaces the team-change scan: per workbook it decides whether the file can be inserted as
 * it is (READY) or must wait (PENDING) with the reason code of the first failed check. Nothing is
 * inserted into the database here, and no team membership is checked.
 *
 * Checks, in order, stopping at the first failure:
 * 1. OPEN_FAILED          the workbook cannot be read
 * 2. HEADER_NOT_FOUND     no row with at least 3 non-empty cells
 * 3. REQUIRED_COLUMN_MISSING   no employee-ID/badge column, or no date column, by header name
 * 4. DATE_MISMATCH        a daily file's date column holds values that are not the file's own day
 *                         (a correction file may hold other days — counted, not failed)
 * 5. EMPTY                no data rows
 * 6. DUPLICATE_OF_OTHER_FILE   the file's row contents are an exact copy of another file's
 *                         (hash over the sorted rows, date cells included); flagged on every file
 *                         of the copy group. Shared rows between two different days are normal and
 *                         never flagged.
 * 7. DUPLICATE_ROWS_IN_FILE    the same employee ID appears twice on the same date
 *
 * Range files (`_to_`) are out of scope this pass: PENDING with RANGE_NOT_IN_SCOPE. `.~lock` files
 * are SKIPPED (their names are printed — they derive from the attendance file names). Other xlsx
 * files are SKIPPED and only counted (their names are not shown, one contains personal names).
 *
 * Privacy (CLAUDE.md §1): results carry counts, dates and reason codes only. IDs and cell values
 * are reduced to anonymous keys here and never leave this module. Prints nothing: the CLI in
 * `scripts/october-file-sort.ts` formats the console output and the report file.
 */
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readSheet } from 'read-excel-file/node';
import {
	DATE_PATTERNS,
	ID_PATTERNS,
	cellText,
	classifyName,
	findColumn,
	findHeaderRow
} from './october-reconcile.js';

export type SortReason =
	| 'RANGE_NOT_IN_SCOPE'
	| 'OPEN_FAILED'
	| 'HEADER_NOT_FOUND'
	| 'REQUIRED_COLUMN_MISSING'
	| 'DATE_MISMATCH'
	| 'EMPTY'
	| 'DUPLICATE_OF_OTHER_FILE'
	| 'DUPLICATE_ROWS_IN_FILE';

export type SortResult = {
	kind: 'daily' | 'correction' | 'range' | 'lock' | 'other';
	/** file day; null for range/lock/other entries */
	day: number | null;
	/** printed only for lock files (their names come from the attendance file names) */
	name: string | null;
	status: 'ready' | 'pending' | 'skipped';
	reason: SortReason | null;
	/** days of the other files this file is an exact copy of (check 6) */
	identicalTo: number[];
	rows: number;
	/** rows with an empty ID cell (counted, not failed) */
	noIdRows: number;
	/** rows with an empty date cell (counted, not failed) */
	noDateRows: number;
	/** rows whose date is not the file's own day (or not a readable date) */
	foreignDateRows: number;
	/** distinct days other than the file's own that appear in its date column */
	foreignDates: number;
	/** extra rows repeating an (employee ID, date) already seen in the same file */
	duplicateRows: number;
};

/** The day number inside a date cell text: `2026-10-25`, `25-10-2026`, `25/10/2026`, `25.10.2026`. */
export function dayFromText(text: string): number | null {
	const iso = /^(\d{4})-10-(\d{1,2})/.exec(text);
	if (iso) return Number(iso[2]);
	const dmy = /^(\d{1,2})[-/. ]10[-/. ](?:2026\b)?/.exec(text);
	if (dmy) return Number(dmy[1]);
	return null;
}

type ReadCandidate =
	| {
			ref: { kind: 'daily' | 'correction'; day: number; name: string };
			rows: string[][];
			hash: string;
			rowsCount: number;
			noIdRows: number;
			noDateRows: number;
			foreignDateRows: number;
			foreignDates: number;
			duplicateRows: number;
	  }
	| { ref: { kind: 'daily' | 'correction'; day: number; name: string }; fail: SortReason };

async function readCandidate(folder: string, ref: ReadCandidate['ref']): Promise<ReadCandidate> {
	let data: unknown[][];
	try {
		data = (await readSheet(path.join(folder, ref.name))) as unknown[][];
	} catch {
		return { ref, fail: 'OPEN_FAILED' };
	}
	const headerRowNo = findHeaderRow(data);
	if (headerRowNo < 0) return { ref, fail: 'HEADER_NOT_FOUND' };
	const headers = data[headerRowNo].map(cellText);
	const idColumn = findColumn(headers, ID_PATTERNS);
	const dateColumn = findColumn(headers, DATE_PATTERNS);
	if (idColumn === null || dateColumn === null) return { ref, fail: 'REQUIRED_COLUMN_MISSING' };

	const rows: string[][] = [];
	const seen = new Map<string, number>();
	const foreignDays = new Set<number>();
	const result = {
		ref,
		rows,
		hash: '',
		rowsCount: 0,
		noIdRows: 0,
		noDateRows: 0,
		foreignDateRows: 0,
		foreignDates: 0,
		duplicateRows: 0
	};
	for (const row of data.slice(headerRowNo + 1)) {
		if (row.filter((cell) => cellText(cell) !== '').length === 0) continue; // blank spreadsheet row
		const text = row.map(cellText);
		rows.push(text);
		result.rowsCount++;
		const id = text[idColumn];
		const dateText = text[dateColumn];
		const day = dateText ? dayFromText(dateText) : null;
		if (!dateText) {
			result.noDateRows++;
		} else if (day === null || day !== ref.day) {
			result.foreignDateRows++;
			if (day !== null) foreignDays.add(day);
		}
		if (!id) {
			result.noIdRows++;
			continue;
		}
		// Check 7: the same employee ID twice on the same date inside one file.
		const key = `${id}\u0001${day === null ? dateText : day}`;
		const count = (seen.get(key) ?? 0) + 1;
		seen.set(key, count);
		if (count > 1) result.duplicateRows++;
	}
	result.foreignDates = foreignDays.size;
	// Check 6 compares full row contents, date cells included (sorted, hashed).
	const sorted = [...rows.map((row) => row.join('\u0001'))].sort();
	result.hash = createHash('sha1').update(sorted.join('\n')).digest('hex');
	return result;
}

/**
 * Classify, read and check every daily and correction workbook in `folder`, plus the range, lock
 * and other files by name. The first sheet of each workbook is read (its own header row is
 * detected inside it).
 */
export async function sortFolder(folder: string): Promise<SortResult[]> {
	const entries = (await readdir(folder, { withFileTypes: true })).filter((entry) =>
		entry.isFile()
	);
	const files: { kind: 'daily' | 'correction'; day: number; name: string }[] = [];
	const results: SortResult[] = [];
	for (const entry of entries) {
		const classified = classifyName(entry.name);
		if (!classified) continue; // not an xlsx file at all: not an input, not listed
		switch (classified.kind) {
			case 'daily':
			case 'correction':
				files.push({ kind: classified.kind, day: classified.day, name: entry.name });
				break;
			case 'range':
				results.push({
					kind: 'range',
					day: null,
					name: null,
					status: 'pending',
					reason: 'RANGE_NOT_IN_SCOPE',
					identicalTo: [],
					rows: 0,
					noIdRows: 0,
					noDateRows: 0,
					foreignDateRows: 0,
					foreignDates: 0,
					duplicateRows: 0
				});
				break;
			case 'lock':
				results.push({
					kind: 'lock',
					day: null,
					name: entry.name,
					status: 'skipped',
					reason: null,
					identicalTo: [],
					rows: 0,
					noIdRows: 0,
					noDateRows: 0,
					foreignDateRows: 0,
					foreignDates: 0,
					duplicateRows: 0
				});
				break;
			case 'other':
				results.push({
					kind: 'other',
					day: null,
					name: null,
					status: 'skipped',
					reason: null,
					identicalTo: [],
					rows: 0,
					noIdRows: 0,
					noDateRows: 0,
					foreignDateRows: 0,
					foreignDates: 0,
					duplicateRows: 0
				});
				break;
		}
	}
	files.sort((a, b) => a.kind.localeCompare(b.kind) || a.day - b.day);

	const candidates: ReadCandidate[] = [];
	for (const ref of files) {
		const candidate = await readCandidate(folder, ref);
		candidates.push(candidate);
		if ('fail' in candidate) {
			results.push({
				kind: ref.kind,
				day: ref.day,
				name: null,
				status: 'pending',
				reason: candidate.fail,
				identicalTo: [],
				rows: 0,
				noIdRows: 0,
				noDateRows: 0,
				foreignDateRows: 0,
				foreignDates: 0,
				duplicateRows: 0
			});
			continue;
		}
		// Corrections may hold other days (check 4 applies to daily files only).
		const dateFailure =
			ref.kind === 'daily' && (candidate.foreignDateRows > 0 || candidate.foreignDates > 0);
		const empty = candidate.rowsCount === 0;
		const reason: SortReason | null = dateFailure ? 'DATE_MISMATCH' : empty ? 'EMPTY' : null;
		results.push({
			kind: ref.kind,
			day: ref.day,
			name: null,
			status: reason ? 'pending' : 'ready',
			reason,
			identicalTo: [],
			rows: candidate.rowsCount,
			noIdRows: candidate.noIdRows,
			noDateRows: candidate.noDateRows,
			foreignDateRows: candidate.foreignDateRows,
			foreignDates: candidate.foreignDates,
			duplicateRows: candidate.duplicateRows
		});
	}

	// Check 6 over the files that reached it: exact copies are flagged on every member of the group.
	const byHash = new Map<string, ReadCandidate[]>();
	for (const candidate of candidates)
		if (!('fail' in candidate)) {
			const group = byHash.get(candidate.hash) ?? [];
			group.push(candidate);
			byHash.set(candidate.hash, group);
		}
	for (const group of byHash.values()) {
		if (group.length < 2) continue;
		for (const candidate of group) {
			const result = results.find(
				(entry) => entry.kind === candidate.ref.kind && entry.day === candidate.ref.day
			);
			if (!result || result.status !== 'ready') continue; // stop at the first failure
			result.status = 'pending';
			result.reason = 'DUPLICATE_OF_OTHER_FILE';
			result.identicalTo = group
				.filter((other) => other !== candidate)
				.map((other) => other.ref.day);
		}
	}
	// Check 7 last (check 6 already had its chance to fire).
	for (const candidate of candidates) {
		if ('fail' in candidate || candidate.duplicateRows === 0) continue;
		const result = results.find(
			(entry) => entry.kind === candidate.ref.kind && entry.day === candidate.ref.day
		);
		if (!result || result.status !== 'ready') continue;
		result.status = 'pending';
		result.reason = 'DUPLICATE_ROWS_IN_FILE';
	}
	return results;
}
