import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TOTALS_COLUMNS,
	monthRange,
	parseTotalsColumns,
	payMonthRange,
	sumTotalsDays,
	totalsRange,
	type TotalsDay
} from './totals.js';

// A made-up team of three made-up people (CLAUDE.md §1: no real names, badges or ids). Every
// person has four made-up days; the expected totals are worked out by hand from those days.

/** A made-up day with only the values the report sums; unset values read as zero / no state. */
const day = (values: Partial<TotalsDay>): TotalsDay => ({
	kind: 'work',
	absenceType: null,
	requiredMinutes: 0,
	workedMinutes: null,
	overtimeMinutes: 0,
	lateMinutes: 0,
	shortageMinutes: 0,
	creditMinutes: 0,
	...values
});

/** Full work days: one clean, one late with a shortage, then a sick day and an off day. */
const daysOfFirst = [
	day({ requiredMinutes: 480, workedMinutes: 480 }),
	day({ requiredMinutes: 480, workedMinutes: 450, lateMinutes: 30, shortageMinutes: 30 }),
	day({ kind: 'absence', absenceType: 'sick' }),
	day({ kind: 'off' })
];

/** One work day with overtime, one not checked out yet, an annual-leave day, and holiday work. */
const daysOfSecond = [
	day({ requiredMinutes: 480, workedMinutes: 500, overtimeMinutes: 20 }),
	day({ requiredMinutes: 480 }),
	day({ kind: 'absence', absenceType: 'leave' }),
	day({
		kind: 'holiday_work',
		requiredMinutes: 480,
		workedMinutes: 540,
		overtimeMinutes: 60,
		creditMinutes: 60
	})
];

/** Two off days, a mission day, and a work day whose shortage a credit covers. */
const daysOfThird = [
	day({ kind: 'off' }),
	day({ kind: 'off' }),
	day({ kind: 'absence', absenceType: 'mission' }),
	day({ requiredMinutes: 480, workedMinutes: 420, shortageMinutes: 60, creditMinutes: 60 })
];

describe('sumTotalsDays', () => {
	it('sums the first made-up person: two work days, one late with a shortage, one sick day', () => {
		expect(sumTotalsDays(daysOfFirst)).toEqual({
			workDays: 2,
			leaveDays: 1,
			requiredMinutes: 960,
			workedMinutes: 930,
			overtimeMinutes: 0,
			lateMinutes: 30,
			shortageMinutes: 30,
			creditMinutes: 0
		});
	});

	it('sums the second: holiday work is not a work day but its minutes count; no worked time yet adds none', () => {
		expect(sumTotalsDays(daysOfSecond)).toEqual({
			workDays: 2,
			leaveDays: 1,
			requiredMinutes: 1440,
			workedMinutes: 1040,
			overtimeMinutes: 80,
			lateMinutes: 0,
			shortageMinutes: 0,
			creditMinutes: 60
		});
	});

	it('sums the third: off days add nothing but the leave day counts', () => {
		expect(sumTotalsDays(daysOfThird)).toEqual({
			workDays: 1,
			leaveDays: 1,
			requiredMinutes: 480,
			workedMinutes: 420,
			overtimeMinutes: 0,
			lateMinutes: 0,
			shortageMinutes: 60,
			creditMinutes: 60
		});
	});

	it('is zero for a person with no days', () => {
		expect(sumTotalsDays([])).toEqual({
			workDays: 0,
			leaveDays: 0,
			requiredMinutes: 0,
			workedMinutes: 0,
			overtimeMinutes: 0,
			lateMinutes: 0,
			shortageMinutes: 0,
			creditMinutes: 0
		});
	});

	it('adds up over the team: the team total is the sum of the three people', () => {
		const people = [daysOfFirst, daysOfSecond, daysOfThird].map((days) => sumTotalsDays(days));
		const add = (a: (typeof people)[number], b: (typeof people)[number]) => ({
			workDays: a.workDays + b.workDays,
			leaveDays: a.leaveDays + b.leaveDays,
			requiredMinutes: a.requiredMinutes + b.requiredMinutes,
			workedMinutes: a.workedMinutes + b.workedMinutes,
			overtimeMinutes: a.overtimeMinutes + b.overtimeMinutes,
			lateMinutes: a.lateMinutes + b.lateMinutes,
			shortageMinutes: a.shortageMinutes + b.shortageMinutes,
			creditMinutes: a.creditMinutes + b.creditMinutes
		});
		expect(sumTotalsDays([...daysOfFirst, ...daysOfSecond, ...daysOfThird])).toEqual(
			people.reduce(add)
		);
	});
});

describe('quick ranges', () => {
	it('builds 21 → 20 for a made-up month: the 21st of the previous month to the 20th of this one', () => {
		expect(payMonthRange('2026-07-04')).toEqual({ from: '2026-06-21', to: '2026-07-20' });
	});

	it('crosses a year boundary: January takes December of the year before', () => {
		expect(payMonthRange('2026-01-31')).toEqual({ from: '2025-12-21', to: '2026-01-20' });
	});

	it('covers the whole calendar month of the anchor, leap years included', () => {
		expect(monthRange('2026-04-09')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
		expect(monthRange('2024-02-11')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
	});

	it('defaults a missing range to this month up to today', () => {
		expect(totalsRange(null, null, '2026-11-15')).toEqual({
			from: '2026-11-01',
			to: '2026-11-15'
		});
	});

	it('keeps any asked dates (SP6) and only defaults the missing one', () => {
		expect(totalsRange('2026-10-21', '2026-11-20', '2026-11-15')).toEqual({
			from: '2026-10-21',
			to: '2026-11-20'
		});
		expect(totalsRange(null, '2026-03-20', '2026-11-15')).toEqual({
			from: '2026-03-01',
			to: '2026-03-20'
		});
	});
});

describe('parseTotalsColumns', () => {
	it('shows the default columns when the URL names none', () => {
		expect(parseTotalsColumns([])).toEqual([...DEFAULT_TOTALS_COLUMNS]);
	});

	it('ignores unknown column names', () => {
		expect(parseTotalsColumns(['workDays', 'not-a-column', 'lateMinutes'])).toEqual([
			'workDays',
			'lateMinutes'
		]);
	});

	it('falls back to the defaults when every name is unknown', () => {
		expect(parseTotalsColumns(['nope', 'also-nope'])).toEqual([...DEFAULT_TOTALS_COLUMNS]);
	});

	it('keeps the table order and drops repeats, whatever the URL order', () => {
		expect(parseTotalsColumns(['lateMinutes', 'workDays', 'workDays'])).toEqual([
			'workDays',
			'lateMinutes'
		]);
	});
});
