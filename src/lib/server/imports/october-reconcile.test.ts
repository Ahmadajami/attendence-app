/**
 * Tests for the October workbook analysis (`october-reconcile.ts`), with made-up people and
 * made-up teams only (CLAUDE.md §1): real .xlsx files are written into a scratchpad folder with
 * the repo's own `write-excel-file`, and the analysis reads them back through the same
 * `read-excel-file` path the real script uses.
 *
 * Covered: a team that changes on the 25th (and again later), a team that never changes, a team
 * on a single day, a file without a team column (reported with its headers and skipped), files
 * without an ID column (row contents as the identity), a repeated day (identical rows despite a
 * different date cell), correction files kept separate, and the range/lock/other-file rules.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { analyseFolder, classifyName, findHeaderRow } from './october-reconcile.js';

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'october-workbooks-'));
});

const HEADER = ['ID', 'Name', 'Team', 'Shift', 'Date'];
/** Two junk rows the header detector must skip (fewer than 3 non-empty cells). */
const JUNK = [
	['October attendance sheet', null, null, null, null],
	['Operations', null, null, null, null]
];

const ALPHA = [
	['FID-A1', 'Fake A One', 'Alpha', 'Morning'],
	['FID-A2', 'Fake A Two', 'Alpha', 'Morning'],
	['FID-A3', 'Fake A Three', 'Alpha', 'Morning']
];
const BRAVO_EARLY = [
	['FID-B1', 'Fake B One', 'Bravo', 'Evening'],
	['FID-B2', 'Fake B Two', 'Bravo', 'Evening'],
	['FID-B3', 'Fake B Three', 'Bravo', 'Evening']
];
const BRAVO_LATE = [
	['FID-B1', 'Fake B One', 'Bravo', 'Evening'],
	['FID-B2', 'Fake B Two', 'Bravo', 'Evening'],
	['FID-B4', 'Fake B Four', 'Bravo', 'Morning'],
	['FID-B5', 'Fake B Five', 'Bravo', 'Morning']
];
/** Days 30–31: like BRAVO_LATE but Fake B Four is out and Fake B Six is in. */
const BRAVO_LATE_2 = [
	...BRAVO_LATE.slice(0, 2),
	['FID-B5', 'Fake B Five', 'Bravo', 'Evening'],
	['FID-B6', 'Fake B Six', 'Bravo', 'Morning']
];

const day = (n: number) => String(n).padStart(2, '0');
const rowsFor = (n: number, people: string[][]) => [
	...JUNK,
	HEADER,
	...people.map((person) => [...person, `2026-10-${day(n)}`])
];

async function writeDaily(n: number, people: string[][]) {
	await writeXlsxFile(rowsFor(n, people)).toFile(
		path.join(dir, `Attendance ${day(n)}-10-2026.xlsx`)
	);
}

async function writeCorrection(n: number, people: string[][]) {
	await writeXlsxFile(rowsFor(n, people)).toFile(
		path.join(dir, `Correction-Attendance ${day(n)}-10-2026.xlsx`)
	);
}

test('file-name classification', () => {
	expect(classifyName('Attendance 25-10-2026.xlsx')).toEqual({ kind: 'daily', day: 25 });
	expect(classifyName('attendance 31-10-2026.xlsx')).toEqual({ kind: 'daily', day: 31 });
	expect(classifyName('Correction-Attendance 28-10-2026.xlsx')).toEqual({
		kind: 'correction',
		day: 28
	});
	expect(classifyName('Attendance_21-09_to_20-10-2026.xlsx')).toEqual({ kind: 'range' });
	expect(classifyName('.~lock.Attendance 25-10-2026.xlsx#')).toEqual({ kind: 'lock' });
	expect(classifyName('notes.txt')).toBeNull();
});

test('header row is the first row with at least 3 non-empty cells', () => {
	expect(
		findHeaderRow([
			['title', null],
			['a', 'b', 'c'],
			['x', 'y', 'z']
		])
	).toBe(1);
	expect(
		findHeaderRow([
			['only', 'two'],
			['still', 'two']
		])
	).toBe(-1);
});

test('team changes, duplicates and the file-kind rules on one folder', async () => {
	// Days 21–31, except 22 which has no team column (reported, skipped).
	for (const n of [21, 23, 24]) await writeDaily(n, [...ALPHA, ...BRAVO_EARLY]);
	for (const n of [25, 26, 27, 28, 29]) await writeDaily(n, [...ALPHA, ...BRAVO_LATE]);
	await writeDaily(30, [...ALPHA, ...BRAVO_LATE_2]);
	await writeDaily(31, [...ALPHA, ...BRAVO_LATE_2, ['FID-O1', 'Fake O One', 'One Day', 'Morning']]);
	await writeXlsxFile([
		...JUNK,
		['ID', 'Name', 'Shift'],
		['FID-A1', 'Fake A One', 'Morning']
	]).toFile(path.join(dir, 'Attendance 22-10-2026.xlsx'));
	// A repeated day: 27's rows are 26's rows (only the Date cell differs) → identical.
	await writeCorrection(28, [...ALPHA, ...BRAVO_EARLY]); // correction = old day-21 content
	await writeCorrection(30, [...ALPHA, ...BRAVO_LATE_2]); // correction = day-30 content
	await writeXlsxFile([['range file', 'kept out']]).toFile(
		path.join(dir, 'Attendance_two_made_up_people_21-09_to_20-10-2026.xlsx')
	);
	await writeFile(path.join(dir, '.~lock.Attendance 25-10-2026.xlsx#'), 'lock');
	await writeFile(path.join(dir, 'notes.txt'), 'ignored');

	const analysis = await analyseFolder(dir);

	// Day 22's file is matched by name (the skip happens at read time, see `problems` below).
	expect(analysis.daily.map((ref) => ref.day)).toEqual([
		21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
	]);
	expect(analysis.corrections.map((correction) => correction.ref.day)).toEqual([28, 30]);
	expect(analysis.rangeFiles).toBe(1);
	expect(analysis.lockFiles).toBe(1);
	expect(analysis.otherXlsx).toBe(0);

	expect(analysis.problems).toEqual([
		{
			ref: { kind: 'daily', day: 22, name: 'Attendance 22-10-2026.xlsx' },
			reason: 'no_team_column',
			headers: ['ID', 'Name', 'Shift']
		}
	]);
	expect(analysis.noIdColumns).toEqual([]);

	// Team "Bravo": Fake B Three out, Fake B Four and Five in on the 25th; on the 30th Fake B Four
	// is out and Fake B Six in. Team "Alpha" never changes; "One Day" appears on a single day.
	const bravo = analysis.teams.find((team) => team.team === 'Bravo');
	expect(bravo?.firstChangeDay).toBe(25);
	expect(bravo?.added).toBe(2);
	expect(bravo?.removed).toBe(1);
	expect(bravo?.changedAgain).toBe(true);
	expect(bravo?.changes).toEqual([
		{ day: 25, added: 2, removed: 1 },
		{ day: 30, added: 1, removed: 1 }
	]);
	const alpha = analysis.teams.find((team) => team.team === 'Alpha');
	expect(alpha?.firstChangeDay).toBeNull();
	expect(alpha?.perDay).toEqual([
		{ day: 21, people: 3 },
		{ day: 23, people: 3 },
		{ day: 24, people: 3 },
		{ day: 25, people: 3 },
		{ day: 26, people: 3 },
		{ day: 27, people: 3 },
		{ day: 28, people: 3 },
		{ day: 29, people: 3 },
		{ day: 30, people: 3 },
		{ day: 31, people: 3 }
	]);
	const oneDay = analysis.teams.find((team) => team.team === 'One Day');
	expect(oneDay).toEqual(
		expect.objectContaining({ firstChangeDay: null, daysPresent: 1, changes: [] })
	);
	expect(analysis.teams).toHaveLength(3);

	// 10 daily files → 45 pairs; content groups {21,23,24}, {25,…,29}, {30} (+31 with one extra
	// row) → 13 pairs identical (the Date cell is excluded from the row signature).
	expect(analysis.duplicates).toHaveLength(45);
	const identical = analysis.duplicates.filter((pair) => pair.identical);
	expect(identical).toHaveLength(13);
	expect(identical.find((pair) => pair.a.day === 26 && pair.b.day === 27)).toEqual(
		expect.objectContaining({ identical: true, shared: 7 })
	);
	expect(identical.find((pair) => pair.a.day === 28 && pair.b.day === 29)).toEqual(
		expect.objectContaining({ identical: true, shared: 7 })
	);
	const changedPair = analysis.duplicates.find((pair) => pair.a.day === 24 && pair.b.day === 25);
	expect(changedPair).toEqual(expect.objectContaining({ identical: false, shared: 5 }));

	// Corrections stay separate inputs: their rows match the daily days they copied.
	expect(analysis.corrections[0]).toEqual(expect.objectContaining({ rows: 6, sharedMax: 6 }));
	expect(
		analysis.corrections[0].sharedByDay.filter((entry) => entry.shared === 6).map((e) => e.day)
	).toEqual([21, 23, 24]);
	expect(
		analysis.corrections[1].sharedByDay.filter((entry) => entry.shared === 7).map((e) => e.day)
	).toEqual([30, 31]);

	// Privacy: no ID or made-up person name ever leaves the analysis.
	expect(JSON.stringify(analysis)).not.toContain('FID-');
	expect(JSON.stringify(analysis)).not.toContain('Fake ');
});

test('files without an ID column use row contents as the person identity', async () => {
	const noIdHeader = ['Name', 'Team', 'Shift', 'Date'];
	const rows = (n: number, people: string[][]) => [
		...JUNK,
		noIdHeader,
		...people.map((person) => [...person, `2026-10-${day(n)}`])
	];
	const morning = [
		['Fake N One', 'Alpha', 'Morning'],
		['Fake N Two', 'Alpha', 'Morning']
	];
	const evening = [
		['Fake N One', 'Alpha', 'Evening'],
		['Fake N Two', 'Alpha', 'Morning']
	];
	await writeXlsxFile(rows(21, morning)).toFile(path.join(dir, 'Attendance 21-10-2026.xlsx'));
	await writeXlsxFile(rows(22, morning)).toFile(path.join(dir, 'Attendance 22-10-2026.xlsx'));
	await writeXlsxFile(rows(23, evening)).toFile(path.join(dir, 'Attendance 23-10-2026.xlsx'));

	const analysis = await analyseFolder(dir);

	expect(analysis.noIdColumns.map((ref) => ref.day)).toEqual([21, 22, 23]);
	expect(analysis.problems).toEqual([]);
	const alpha = analysis.teams.find((team) => team.team === 'Alpha');
	expect(alpha?.firstChangeDay).toBe(23);
	expect(alpha?.added).toBe(1);
	expect(alpha?.removed).toBe(1);
});

test('an unreadable file and a file without a header row are reported and skipped', async () => {
	await writeFile(path.join(dir, 'Attendance 21-10-2026.xlsx'), Buffer.from('not a workbook'));
	await writeXlsxFile([
		['a', 'b'],
		['c', 'd']
	]).toFile(path.join(dir, 'Attendance 22-10-2026.xlsx'));

	const analysis = await analyseFolder(dir);

	expect(analysis.problems.map((problem) => [problem.ref.day, problem.reason]).sort()).toEqual([
		[21, 'unreadable'],
		[22, 'no_header_row']
	]);
	expect(analysis.teams).toEqual([]);
	expect(analysis.duplicates).toEqual([]);
});
