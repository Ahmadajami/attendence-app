import { describe, expect, it } from 'vitest';
import {
	GridDatesError,
	MissingColumnError,
	readRosterGrid,
	readShiftFile,
	type FileTable
} from './roster-file.js';

const table = (headers: string[], rows: string[][]): FileTable => ({
	headers,
	rows: rows.map((values, i) => ({ rowNo: i + 2, values }))
});

describe('readShiftFile', () => {
	const HEAD = ['Code', 'Name EN', 'Name AR', 'Start', 'End', 'Required minutes', 'Break minutes'];

	it('reads shifts with the shift form rules', () => {
		const read = readShiftFile(
			table(HEAD, [
				['908', 'Day 9h 08:00', 'نهاري 9س', '08:00', '17:00', '540', ''],
				['e06', 'Day 11h 06:00', 'نهاري 11س', '1899-12-30T06:00:00', '17:00', '660', '0']
			])
		);
		expect(read.issues).toEqual([]);
		expect(
			read.lines.map((l) => [l.line, l.shift.code, l.shift.startTime, l.shift.requiredMinutes])
		).toEqual([
			[2, '908', '08:00', 540],
			[3, 'E06', '06:00', 660]
		]);
	});

	it('reports a bad line by field and a code twice in the file (R7)', () => {
		const read = readShiftFile(
			table(HEAD, [
				['908', 'A', 'أ', '08:00', '17:00', '540', ''],
				['TOOLONG', 'B', 'ب', '08:00', '17:00', '540', ''],
				['909', 'C', 'ج', '25:00', '17:00', '540', ''],
				['908', 'D', 'د', '09:00', '18:00', '540', '']
			])
		);
		expect(read.issues).toEqual([
			{ line: 3, code: 'invalid', field: 'code' },
			{ line: 4, code: 'invalid', field: 'startTime' },
			{ line: 5, code: 'duplicate_in_file', field: 'code' }
		]);
		expect(() => readShiftFile(table(['Code'], []))).toThrow(MissingColumnError);
	});
});

describe('readRosterGrid', () => {
	it('reads the grid: date columns in order, codes upper-cased, empty kept as no plan', () => {
		const read = readRosterGrid(
			table(
				['Employee No', 'Department', 'Team', '2026-10-02', '2026-10-01', '2026-10-03'],
				[
					['9001', 'Dept A', '', 'o', 'd', ''],
					['9002', '', 'Team B', 'N', 'N', 'O'],
					['', 'Dept A', '', 'D', 'D', 'D'],
					['9003', '', '', 'D', 'D', 'D']
				]
			)
		);
		expect(read.dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
		expect(read.lines).toEqual([
			{ line: 2, employeeNo: '9001', department: 'Dept A', team: '', codes: ['D', 'O', ''] },
			{ line: 3, employeeNo: '9002', department: '', team: 'Team B', codes: ['N', 'N', 'O'] }
		]);
		expect(read.issues).toEqual([
			{ line: 4, code: 'no_employee' },
			{ line: 5, code: 'no_group' }
		]);
	});

	it('refuses dates over two months or with a gap (R7)', () => {
		const grid = (dates: string[]) => readRosterGrid(table(['Employee No', 'Team', ...dates], []));
		expect(() => grid(['2026-10-31', '2026-11-01'])).toThrow(GridDatesError);
		expect(() => grid(['2026-10-01', '2026-10-03'])).toThrow(GridDatesError);
		expect(() => grid([])).toThrow(GridDatesError);
	});
});
