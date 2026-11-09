import { describe, expect, it } from 'vitest';
import { addDays } from './cycle.js';
import {
	dropDuplicateRows,
	findSwaps,
	fitRow,
	readWorkbookRows,
	type CycleCodes,
	type DayCode,
	type RowCells
} from './fit-roster.js';

// A made-up 4-day cycle: day, night, two off days. 8 dates from the anchor.
const cycle: CycleCodes = { slots: ['D', 'N', null, null], anchorDate: '2030-01-01' };
const dates = Array.from({ length: 8 }, (_, i) => addDays('2030-01-01', i));
const row = (codes: string): RowCells =>
	[...codes].map((c): DayCode | undefined => (c === '.' ? undefined : c === 'O' ? null : c));

describe('fitRow', () => {
	it('finds the one crew start of a perfect fit', () => {
		// crew start 2: O O D N O O D N
		expect(fitRow(cycle, dates, row('OODNOODN'))).toEqual({
			crewStarts: [2],
			misses: [],
			missing: []
		});
	});

	it('reports the misses of a row that fits nothing', () => {
		const fit = fitRow(cycle, dates, row('NNNNNNNN'));
		expect(fit.misses.length).toBeGreaterThanOrEqual(6);
		expect(
			findSwaps(cycle, dates, [{ key: 'x', crewStart: fit.crewStarts[0], cells: row('NNNNNNNN') }])
				.unexplained
		).toHaveLength(fit.misses.length);
	});

	it('compares only filled days of a short row, and reports ties', () => {
		const short = fitRow(cycle, dates, row('DNO'));
		expect(short.crewStarts).toEqual([0]);
		expect(short.missing).toEqual(dates.slice(3));
		expect(fitRow(cycle, dates, row('O.......')).crewStarts).toEqual([2, 3]);
	});
});

describe('findSwaps', () => {
	it('explains a two-person swap with a return date', () => {
		// A (crew 0) planned D N O O D N O O; B (crew 2) planned O O D N O O D N.
		// Swap: Jan 1 B works A's D, A is off; Jan 3 A works B's D, B is off.
		const a = row('ONDODNOO');
		const b = row('DOONOODN');
		expect(fitRow(cycle, dates, a)).toMatchObject({ crewStarts: [0] });
		expect(fitRow(cycle, dates, b)).toMatchObject({ crewStarts: [2] });
		expect(
			findSwaps(cycle, dates, [
				{ key: 'B', crewStart: 2, cells: b },
				{ key: 'A', crewStart: 0, cells: a }
			])
		).toEqual({
			swaps: [{ a: 'A', b: 'B', date: '2030-01-01', returnDate: '2030-01-03' }],
			unexplained: []
		});
	});

	it('leaves odd days without a partner unexplained', () => {
		const a = row('ONOODNOO');
		expect(findSwaps(cycle, dates, [{ key: 'A', crewStart: 0, cells: a }])).toEqual({
			swaps: [],
			unexplained: [{ key: 'A', date: '2030-01-01', expected: 'D', got: null }]
		});
	});
});

describe('readWorkbookRows', () => {
	const codes = new Map<string, DayCode>([
		['D', 'D8'],
		['N', 'N8'],
		['O', null]
	]);

	it('reads person rows by position and reports the rest', () => {
		const sheet = [
			['No.', 'Name', 1, 2, 3],
			[null, null, 'SUN', 'MON', 'TUE'],
			[1001, 'Test Person A', 'd', 'N', 'O'],
			['1002', 'Test Person B', 'D', 'X', null],
			[null, 'Test Person C', 'N', 'O', 'D']
		];
		expect(readWorkbookRows(sheet, 3, codes)).toEqual({
			rows: [
				{ row: 3, employeeNo: '1001', cells: ['D8', 'N8', null] },
				{ row: 4, employeeNo: '1002', cells: ['D8', undefined, undefined] }
			],
			issues: [
				{ code: 'unknown_code', row: 4, day: 2, value: 'X' },
				{ code: 'no_employee_no', row: 5 }
			]
		});
	});

	it('keeps the fuller of two rows with the same number', () => {
		const result = dropDuplicateRows([
			{ row: 7, employeeNo: '1001', cells: ['D8', undefined, undefined] },
			{ row: 9, employeeNo: '1002', cells: [null, null, 'N8'] },
			{ row: 13, employeeNo: '1001', cells: ['D8', 'N8', null] }
		]);
		expect(result.kept.map((r) => r.row)).toEqual([9, 13]);
		expect(result.duplicates).toEqual([{ row: 7, of: 13, filled: 1 }]);
	});
});
