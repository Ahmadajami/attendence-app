/**
 * Tests for the October file sorter (`october-sort.ts`), with made-up people and made-up teams
 * only (CLAUDE.md §1): real .xlsx files are written into a scratchpad folder with the repo's own
 * `write-excel-file`, and the sorter reads them back through the same `read-excel-file` path the
 * real script uses.
 *
 * Covered: one clean file that ends up READY; every reason code once (OPEN_FAILED,
 * HEADER_NOT_FOUND, REQUIRED_COLUMN_MISSING, DATE_MISMATCH, EMPTY, DUPLICATE_OF_OTHER_FILE,
 * DUPLICATE_ROWS_IN_FILE); a correction file holding other days that stays READY; the range file
 * (RANGE_NOT_IN_SCOPE); a lock file (SKIPPED); and a non-xlsx file that is not listed.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { sortFolder } from './october-sort.js';

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'october-sort-'));
});

const HEADER = ['ID', 'Name', 'Team', 'Shift', 'Date'];

const day = (n: number) => String(n).padStart(2, '0');
const rowFor = (id: string, name: string, team: string, date: string) => [
	id,
	name,
	team,
	'Morning',
	date
];

async function writeWorkbook(name: string, rows: (string | null)[][]) {
	await writeXlsxFile(rows).toFile(path.join(dir, name));
}

const writeDaily = (n: number, rows: (string | null)[][]) =>
	writeWorkbook(`Attendance ${day(n)}-10-2026.xlsx`, rows);
const writeCorrection = (n: number, rows: (string | null)[][]) =>
	writeWorkbook(`Correction-Attendance ${day(n)}-10-2026.xlsx`, rows);

const sort = () => sortFolder(dir);
const byDay = (results: Awaited<ReturnType<typeof sort>>, kind: string, dayNo: number) =>
	results.find((result) => result.kind === kind && result.day === dayNo);

test('one clean file with a tolerated blank date and blank ID row is READY', async () => {
	await writeDaily(21, [
		HEADER,
		rowFor('FID-A1', 'Fake A One', 'Alpha', `2026-10-21`),
		rowFor('FID-A2', 'Fake A Two', 'Alpha', `2026-10-21`),
		rowFor('', 'Fake A Three', 'Alpha', `2026-10-21`), // blank ID: counted, not failed
		rowFor('FID-A4', 'Fake A Four', 'Alpha', ''), // blank date: counted, not failed
		[null, null, null, null, null] // blank spreadsheet row: not a data row
	]);

	const results = await sort();

	expect(results).toHaveLength(1);
	expect(results[0]).toEqual(
		expect.objectContaining({
			kind: 'daily',
			day: 21,
			status: 'ready',
			reason: null,
			rows: 4,
			noIdRows: 1,
			noDateRows: 1,
			foreignDateRows: 0,
			duplicateRows: 0
		})
	);
	expect(JSON.stringify(results)).not.toContain('FID-');
	expect(JSON.stringify(results)).not.toContain('Fake ');
});

test('every reason code fires on the folder', async () => {
	// 21 stays READY (control).
	await writeDaily(21, [
		HEADER,
		rowFor('FID-A1', 'Fake A One', 'Alpha', `2026-10-21`),
		rowFor('FID-A2', 'Fake A Two', 'Alpha', `2026-10-21`)
	]);
	// 22: not a workbook.
	await writeFile(path.join(dir, 'Attendance 22-10-2026.xlsx'), Buffer.from('garbage'));
	// 23: no header row (no row with 3 non-empty cells).
	await writeDaily(23, [
		['ID', 'Name'],
		['FID-A1', 'Fake A One']
	]);
	// 24: no ID and no date column.
	await writeDaily(24, [
		['Name', 'Team', 'Shift'],
		['Fake A One', 'Alpha', 'Morning']
	]);
	// 25: the date column holds one row of another day.
	await writeDaily(25, [
		HEADER,
		rowFor('FID-A1', 'Fake A One', 'Alpha', `2026-10-25`),
		rowFor('FID-A2', 'Fake A Two', 'Alpha', `2026-10-24`)
	]);
	// 26: header but no data rows.
	await writeDaily(26, [HEADER]);
	// 27: clean — but correction 28 is its exact copy, so both are flagged (check 6).
	const copy = [
		HEADER,
		rowFor('FID-B1', 'Fake B One', 'Bravo', `2026-10-27`),
		rowFor('FID-B2', 'Fake B Two', 'Bravo', `2026-10-27`)
	];
	await writeDaily(27, copy);
	await writeCorrection(28, copy);
	// 29: the same ID twice on the same date (check 7).
	await writeDaily(29, [
		HEADER,
		rowFor('FID-C1', 'Fake C One', 'Charlie', `2026-10-29`),
		rowFor('FID-C1', 'Fake C One', 'Charlie', `2026-10-29`)
	]);
	// 30: a correction file holding two days (check 4 exempts corrections) — READY.
	await writeCorrection(30, [
		HEADER,
		rowFor('FID-D1', 'Fake D One', 'Delta', `2026-10-27`),
		rowFor('FID-D1', 'Fake D One', 'Delta', `2026-10-30`)
	]);
	// 31: clean.
	await writeDaily(31, [HEADER, rowFor('FID-E1', 'Fake E One', 'Echo', `2026-10-31`)]);
	// Range file out of scope; a lock file skipped; a non-xlsx file not listed.
	await writeWorkbook('Attendance_two_made_up_people_21-09_to_20-10-2026.xlsx', [
		['range header', 'x', 'y']
	]);
	await writeFile(path.join(dir, '.~lock.Attendance 21-10-2026.xlsx#'), 'lock');
	await writeFile(path.join(dir, 'notes.txt'), 'ignored');

	const results = await sort();

	expect(byDay(results, 'daily', 21)).toEqual(
		expect.objectContaining({ status: 'ready', reason: null, rows: 2 })
	);
	expect(byDay(results, 'daily', 22)).toEqual(
		expect.objectContaining({ status: 'pending', reason: 'OPEN_FAILED', rows: 0 })
	);
	expect(byDay(results, 'daily', 23)).toEqual(
		expect.objectContaining({ status: 'pending', reason: 'HEADER_NOT_FOUND' })
	);
	expect(byDay(results, 'daily', 24)).toEqual(
		expect.objectContaining({ status: 'pending', reason: 'REQUIRED_COLUMN_MISSING' })
	);
	expect(byDay(results, 'daily', 25)).toEqual(
		expect.objectContaining({
			status: 'pending',
			reason: 'DATE_MISMATCH',
			foreignDateRows: 1,
			foreignDates: 1
		})
	);
	expect(byDay(results, 'daily', 26)).toEqual(
		expect.objectContaining({ status: 'pending', reason: 'EMPTY', rows: 0 })
	);
	expect(byDay(results, 'daily', 27)).toEqual(
		expect.objectContaining({
			status: 'pending',
			reason: 'DUPLICATE_OF_OTHER_FILE',
			rows: 2,
			identicalTo: [28]
		})
	);
	expect(byDay(results, 'correction', 28)).toEqual(
		expect.objectContaining({
			status: 'pending',
			reason: 'DUPLICATE_OF_OTHER_FILE',
			identicalTo: [27]
		})
	);
	expect(byDay(results, 'daily', 29)).toEqual(
		expect.objectContaining({
			status: 'pending',
			reason: 'DUPLICATE_ROWS_IN_FILE',
			rows: 2,
			duplicateRows: 1
		})
	);
	// Check 6 does not fire on shared rows: 30 shares people with other days but is its own file.
	expect(byDay(results, 'correction', 30)).toEqual(
		expect.objectContaining({
			status: 'ready',
			reason: null,
			rows: 2,
			foreignDateRows: 1,
			foreignDates: 1
		})
	);
	expect(byDay(results, 'daily', 31)).toEqual(
		expect.objectContaining({ status: 'ready', reason: null, rows: 1 })
	);
	const range = results.find((result) => result.kind === 'range');
	expect(range).toEqual(
		expect.objectContaining({ status: 'pending', reason: 'RANGE_NOT_IN_SCOPE', name: null })
	);
	const lock = results.find((result) => result.kind === 'lock');
	expect(lock).toEqual(
		expect.objectContaining({ status: 'skipped', name: '.~lock.Attendance 21-10-2026.xlsx#' })
	);
	expect(results.filter((result) => result.kind === 'other')).toHaveLength(0);

	// Privacy: no ID or made-up person name ever leaves the analysis.
	expect(JSON.stringify(results)).not.toContain('FID-');
	expect(JSON.stringify(results)).not.toContain('Fake ');
});

test('three files sharing people but not identical are all READY', async () => {
	const people = (date: string) => [
		HEADER,
		rowFor('FID-A1', 'Fake A One', 'Alpha', date),
		rowFor('FID-A2', 'Fake A Two', 'Alpha', date)
	];
	await writeDaily(21, people('2026-10-21'));
	await writeDaily(22, people('2026-10-22'));
	await writeDaily(23, people('2026-10-23'));

	const results = await sort();

	expect(results.filter((result) => result.status === 'ready')).toHaveLength(3);
	expect(results.filter((result) => result.status === 'pending')).toHaveLength(0);
});
