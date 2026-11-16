/**
 * October workbook analysis (plan 2026-11-15-october-excel-reconciliation.md, the
 * "roster changes late in October" brief): reads the daily `Attendance DD-10-2026.xlsx` files and
 * the two correction files of one folder, groups each day's rows by the workbook's team column,
 * and answers two questions without touching any database:
 *
 * 1. per team, the first date whose set of people differs from the previous day present in the
 *    files ("no change" when it never differs), with the added/removed counts and whether it
 *    changed again later;
 * 2. which pairs of daily files carry the same rows (a repeated day), and for the pairs that are
 *    not identical, how many rows appear on two different days.
 *
 * The correction files are read as separate inputs and are never merged into the daily days;
 * the `_to_` range file is only counted, never read. LibreOffice `.~lock` files are skipped.
 *
 * Privacy (CLAUDE.md §1): the result holds counts, dates, team names and header names only.
 * Employee IDs and row contents are reduced to anonymous keys here and never leave this module.
 * When the team column cannot be found, the file is reported with its header names and skipped —
 * the user says which column is right; nothing is guessed.
 *
 * This module prints nothing: `scripts/october-roster-changes.ts` formats the console output and
 * the report file from the returned data.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readSheet } from 'read-excel-file/node';

/** `Attendance 25-10-2026.xlsx` (name match is case-insensitive; the month is fixed: October). */
const DAILY_NAME = /^attendance (\d{1,2})-10-2026\.xlsx$/i;
/** `Correction-Attendance 28-10-2026.xlsx`. */
const CORRECTION_NAME = /^correction-attendance (\d{1,2})-10-2026\.xlsx$/i;

export type FileRef = { kind: 'daily' | 'correction'; day: number; name: string };

export type NameClass =
	| { kind: 'daily'; day: number }
	| { kind: 'correction'; day: number }
	| { kind: 'range' }
	| { kind: 'lock' }
	| { kind: 'other' };

/** Classify by file name only (nothing is opened). `null` = not an xlsx file, ignore silently. */
export function classifyName(name: string): NameClass | null {
	if (name.startsWith('.~lock')) return { kind: 'lock' };
	if (!name.toLowerCase().endsWith('.xlsx')) return null;
	if (name.includes('_to_')) return { kind: 'range' };
	const daily = DAILY_NAME.exec(name);
	if (daily) return { kind: 'daily', day: Number(daily[1]) };
	const correction = CORRECTION_NAME.exec(name);
	if (correction) return { kind: 'correction', day: Number(correction[1]) };
	return { kind: 'other' };
}

/** Stable text form of one cell: dates become a fixed instant string, the rest trims. */
export function cellText(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date) return value.toISOString();
	return String(value).trim();
}

const nonEmpty = (row: readonly unknown[]) => row.filter((cell) => cellText(cell) !== '').length;

/** First row with at least 3 non-empty cells (the brief's header rule); -1 when there is none. */
export function findHeaderRow(rows: readonly (readonly unknown[])[]): number {
	return rows.findIndex((row) => nonEmpty(row) >= 3);
}

/**
 * Column detection, most specific pattern first. A bare "No"/"number" header is deliberately not
 * accepted: a serial-number column would make every row look like a new person and invent changes.
 * Arabic and English both match; the user corrects via the printed headers when nothing matches.
 */
const TEAM_PATTERNS = [
	/\bteam\b|فريق/iu,
	/\bdepartment\b|\bdept\b|قسم/iu,
	/\bsection\b|\bunit\b|وحدة/iu
];
const ID_PATTERNS = [
	/\bbadge\b|بصمة|بطاقة/iu,
	/\bemployee ?(id|no|number|#)\b|\bemp ?(id|no|number|#)\b|رقم ?(الموظف|الوظيفي)/iu,
	/\bid\b|هوية/iu,
	/\bstaff ?(id|no|number|#)\b/iu
];
/** Columns excluded from the duplicate "row content" signature: they carry the day, not the data. */
const DATE_PATTERNS = [/\bdate\b|\bday\b|تاريخ|يوم/iu];

/** Index of the first header matching any pattern, or null. */
export function findColumn(headers: readonly string[], patterns: readonly RegExp[]): number | null {
	for (const pattern of patterns) {
		const index = headers.findIndex((header) => pattern.test(header));
		if (index >= 0) return index;
	}
	return null;
}

type ReadFile = {
	ref: FileRef;
	headers: string[];
	headerRowNo: number;
	teamColumn: number | null;
	idColumn: number | null;
	dateColumns: number[];
	rowCount: number;
	noTeamRows: number;
	noIdRows: number;
	/** team key → identity keys (employee IDs, or row signatures when there is no ID column) */
	teamSets: Map<string, Set<string>>;
	/** team key → first team name seen for it (display only) */
	teamNames: Map<string, string>;
	/** one anonymous signature per row, date columns excluded (for the duplicate check) */
	signatures: string[];
};

export type Problem =
	| { ref: FileRef; reason: 'unreadable' }
	| { ref: FileRef; reason: 'no_header_row' }
	| { ref: FileRef; reason: 'no_team_column'; headers: string[] };

/** A file read and analysed without an ID column: rows (minus date columns) act as the identity. */
export type FileSummary = FileRef & {
	rows: number;
	noTeamRows: number;
	noIdRows: number;
	dateColumns: string[];
};

export type TeamChange = {
	team: string;
	/** null = the set never changed between two present days ("no change") */
	firstChangeDay: number | null;
	added: number;
	removed: number;
	changedAgain: boolean;
	/** every day that differs from the day before it, in order */
	changes: { day: number; added: number; removed: number }[];
	/** set size on each day the team appears in a daily file, in day order */
	perDay: { day: number; people: number }[];
	daysPresent: number;
};

export type PairDuplicate = { a: FileRef; b: FileRef; identical: boolean; shared: number };

export type CorrectionSummary = {
	ref: FileRef;
	rows: number;
	/** rows shared with each daily file, in day order */
	sharedByDay: { day: number; shared: number }[];
	/** maximum shared count over the daily files */
	sharedMax: number;
};

export type OctoberAnalysis = {
	daily: FileRef[];
	/** correction files, kept as separate inputs: row counts and how much matches a daily file */
	corrections: CorrectionSummary[];
	rangeFiles: number;
	lockFiles: number;
	otherXlsx: number;
	problems: Problem[];
	noIdColumns: FileRef[];
	files: FileSummary[];
	teams: TeamChange[];
	duplicates: PairDuplicate[];
};

/** One row's content signature: all cells as text, joined; date columns left out. */
function contentSignature(row: readonly unknown[], dateColumns: Set<number>): string {
	return row.map((cell, index) => (dateColumns.has(index) ? '' : cellText(cell))).join('\u0001');
}

async function readOneFile(folder: string, ref: FileRef): Promise<ReadFile | Problem> {
	let rows: unknown[][];
	try {
		rows = (await readSheet(path.join(folder, ref.name))) as unknown[][];
	} catch {
		return { ref, reason: 'unreadable' };
	}
	const headerRowNo = findHeaderRow(rows);
	if (headerRowNo < 0) return { ref, reason: 'no_header_row' };
	const headerRow = rows[headerRowNo];
	const headers = headerRow.map(cellText);
	const teamColumn = findColumn(headers, TEAM_PATTERNS);
	if (teamColumn === null) return { ref, reason: 'no_team_column', headers };
	const idColumn = findColumn(headers, ID_PATTERNS);
	const dateColumns = new Set(
		headers
			.map((header, index) => (DATE_PATTERNS.some((pattern) => pattern.test(header)) ? index : -1))
			.filter((index) => index >= 0)
	);

	const data = rows.slice(headerRowNo + 1);
	const file: ReadFile = {
		ref,
		headers,
		headerRowNo,
		teamColumn,
		idColumn,
		dateColumns: [...dateColumns],
		rowCount: 0,
		noTeamRows: 0,
		noIdRows: 0,
		teamSets: new Map(),
		teamNames: new Map(),
		signatures: []
	};
	for (const row of data) {
		const signature = contentSignature(row, dateColumns);
		if (nonEmpty(row) === 0) continue; // fully empty spreadsheet row
		file.rowCount++;
		file.signatures.push(signature);
		const team = cellText(row[teamColumn]);
		if (!team) {
			file.noTeamRows++;
			continue;
		}
		const key = team.replace(/\s+/g, ' ');
		if (!file.teamNames.has(key)) file.teamNames.set(key, team);
		let set = file.teamSets.get(key);
		if (!set) file.teamSets.set(key, (set = new Set()));
		const identity = idColumn === null ? signature : cellText(row[idColumn]);
		if (!identity) {
			file.noIdRows++;
			continue;
		}
		set.add(identity);
	}
	return file;
}

/** Rows of `a` whose content also appears in `b` (multiset intersection, so repeats count once). */
function sharedRowCount(a: readonly string[], b: readonly string[]): number {
	const counts = new Map<string, number>();
	for (const signature of a) counts.set(signature, (counts.get(signature) ?? 0) + 1);
	let shared = 0;
	for (const signature of b) {
		const left = counts.get(signature) ?? 0;
		if (left > 0) {
			shared++;
			counts.set(signature, left - 1);
		}
	}
	return shared;
}

/**
 * Read and analyse every daily and correction workbook in `folder`. The folder is listed and each
 * file is classified by name; range and lock files are only counted. The first sheet of each
 * workbook is read (the workbook's own header row is detected inside it).
 */
export async function analyseFolder(folder: string): Promise<OctoberAnalysis> {
	const entries = (await readdir(folder, { withFileTypes: true })).filter((entry) =>
		entry.isFile()
	);
	const daily: FileRef[] = [];
	const corrections: FileRef[] = [];
	let rangeFiles = 0;
	let lockFiles = 0;
	let otherXlsx = 0;
	for (const entry of entries) {
		const classified = classifyName(entry.name);
		if (!classified) continue;
		switch (classified.kind) {
			case 'daily':
				daily.push({ kind: 'daily', day: classified.day, name: entry.name });
				break;
			case 'correction':
				corrections.push({ kind: 'correction', day: classified.day, name: entry.name });
				break;
			case 'range':
				rangeFiles++;
				break;
			case 'lock':
				lockFiles++;
				break;
			case 'other':
				otherXlsx++;
				break;
		}
	}
	daily.sort((a, b) => a.day - b.day);
	corrections.sort((a, b) => a.day - b.day);

	const problems: Problem[] = [];
	const noIdColumns: FileRef[] = [];
	const files: FileSummary[] = [];
	const readDaily: ReadFile[] = [];
	const readCorrections: ReadFile[] = [];
	for (const ref of [...daily, ...corrections]) {
		const result = await readOneFile(folder, ref);
		if ('reason' in result) {
			problems.push(result);
			continue;
		}
		files.push({
			kind: ref.kind,
			day: ref.day,
			name: ref.name,
			rows: result.rowCount,
			noTeamRows: result.noTeamRows,
			noIdRows: result.noIdRows,
			dateColumns: result.dateColumns.map((index) => result.headers[index])
		});
		if (result.idColumn === null) noIdColumns.push(ref);
		if (ref.kind === 'daily') readDaily.push(result);
		else readCorrections.push(result);
	}

	// Per team across the daily files: the days where the set of people changed.
	const teamKeys = new Map<string, string>();
	for (const file of readDaily)
		for (const [key, name] of file.teamNames) if (!teamKeys.has(key)) teamKeys.set(key, name);
	const teams: TeamChange[] = [...teamKeys]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, name]) => {
			const series = readDaily.map((file) => ({
				day: file.ref.day,
				set: file.teamSets.get(key) ?? null
			}));
			const present = series.filter((entry) => entry.set !== null);
			const changes: TeamChange['changes'] = [];
			for (let i = 1; i < present.length; i++) {
				const previous = present[i - 1].set!;
				const current = present[i].set!;
				const added = [...current].filter((id) => !previous.has(id)).length;
				const removed = [...previous].filter((id) => !current.has(id)).length;
				if (added + removed > 0) changes.push({ day: present[i].day, added, removed });
			}
			return {
				team: name,
				firstChangeDay: changes[0]?.day ?? null,
				added: changes[0]?.added ?? 0,
				removed: changes[0]?.removed ?? 0,
				changedAgain: changes.length > 1,
				changes,
				perDay: present.map((entry) => ({ day: entry.day, people: entry.set!.size })),
				daysPresent: present.length
			};
		});

	// Duplicate daily files: every pair, identical rows or the count of shared rows.
	const duplicates: PairDuplicate[] = [];
	for (let i = 0; i < readDaily.length; i++) {
		for (let j = i + 1; j < readDaily.length; j++) {
			const a = readDaily[i];
			const b = readDaily[j];
			const shared = sharedRowCount(a.signatures, b.signatures);
			duplicates.push({
				a: a.ref,
				b: b.ref,
				identical: a.rowCount === b.rowCount && shared === a.rowCount,
				shared
			});
		}
	}

	// Correction files stay separate: how much of each one already looks like a daily file.
	const correctionSummaries: CorrectionSummary[] = readCorrections.map((file) => {
		const sharedByDay = readDaily.map((dailyFile) => ({
			day: dailyFile.ref.day,
			shared: sharedRowCount(file.signatures, dailyFile.signatures)
		}));
		return {
			ref: file.ref,
			rows: file.rowCount,
			sharedByDay,
			sharedMax: Math.max(0, ...sharedByDay.map((entry) => entry.shared))
		};
	});

	return {
		daily,
		rangeFiles,
		lockFiles,
		otherXlsx,
		problems,
		noIdColumns,
		files,
		teams,
		duplicates,
		corrections: correctionSummaries
	};
}
