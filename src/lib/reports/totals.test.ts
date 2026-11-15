import { describe, expect, it } from 'vitest';
import {
	overtimePay,
	resolvePayRule,
	type PayRule,
	type PayRuleVersion
} from '#lib/payroll/pay-rule.js';
import { containsPattern } from '#lib/attendance/person-search.js';
import {
	capOvertimeMinutes,
	DEFAULT_TOTALS_COLUMNS,
	monthRange,
	parseTotalsCap,
	basePayOf,
	payCoefficients,
	shiftHoursOf,
	dayRateOf,
	personDayRows,
	parseTotalsColumns,
	parseTotalsParams,
	parseTotalsSearch,
	parseTotalsSort,
	payMonthRange,
	sumTotalsDays,
	totalsRange,
	type PersonDay,
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

describe('sort and search from the URL (R1)', () => {
	it('defaults to name ascending, and an unknown key or direction falls back', () => {
		expect(parseTotalsSort(null, null)).toEqual({ key: 'name', dir: 'asc' });
		expect(parseTotalsSort('nope', 'sideways')).toEqual({ key: 'name', dir: 'asc' });
		expect(parseTotalsSort('overtimeMinutes', 'desc')).toEqual({
			key: 'overtimeMinutes',
			dir: 'desc'
		});
	});

	it('keeps a column sort in either direction', () => {
		expect(parseTotalsSort('workedMinutes', 'asc')).toEqual({ key: 'workedMinutes', dir: 'asc' });
		expect(parseTotalsSort('shortageMinutes', 'desc')).toEqual({
			key: 'shortageMinutes',
			dir: 'desc'
		});
	});

	it('trims the search text and cuts it to the limit; blank means no search', () => {
		expect(parseTotalsSearch('   ')).toBe('');
		expect(parseTotalsSearch(null)).toBe('');
		expect(parseTotalsSearch('  Made Up  ')).toBe('Made Up');
		expect(parseTotalsSearch('x'.repeat(150))).toHaveLength(100);
	});

	it('escapes LIKE wildcards in the pattern and keeps Arabic text as typed', () => {
		expect(containsPattern('50%_off')).toBe('%50\\%\\_off%');
		expect(containsPattern('محمد')).toBe('%محمد%');
	});

	it('the page and the Excel export read the same URL to the same filter', () => {
		const url = new URLSearchParams(
			'from=2026-11-01&to=2026-11-15&sort=overtimeMinutes&dir=desc&q=Made&col=workDays&col=overtimeMinutes'
		);
		const first = parseTotalsParams(url);
		const second = parseTotalsParams(new URLSearchParams(url.toString()));
		expect(second).toEqual(first);
		expect(first).toEqual({
			from: '2026-11-01',
			to: '2026-11-15',
			sort: { key: 'overtimeMinutes', dir: 'desc' },
			q: 'Made',
			cap: null,
			columns: ['workDays', 'overtimeMinutes']
		});
	});
});

describe('overtime eligibility and the cap (R7)', () => {
	// Made-up rates: the test checks where a rate comes from, not what its value is.
	const pattern: PayRule = { otEnabled: true, workDayRate: 1.2, offDayRate: 1.8, holidayRate: 2 };

	it('a pattern with overtime off makes 0 eligible minutes', () => {
		const versions: PayRuleVersion[] = [
			{
				effectiveFrom: '2026-01-01',
				effectiveTo: null,
				otEnabled: false,
				workDayRate: null,
				offDayRate: null,
				holidayRate: null
			}
		];
		const rule = resolvePayRule(versions, '2026-11-10').rule;
		const pay = overtimePay('work', 60, rule);
		expect(pay.paidMinutes).toBe(0);
		expect(pay.reason).toBe('ot_off');
		expect(capOvertimeMinutes(pay.paidMinutes, 480, 25)).toBe(0);
	});

	it('a cap of 25 % of 480 required minutes gives 120 minutes', () => {
		expect(capOvertimeMinutes(300, 480, 25)).toBe(120);
	});

	it('fewer eligible minutes than the cap are all kept', () => {
		expect(capOvertimeMinutes(90, 480, 25)).toBe(90);
	});

	it('a blank cap gives no limit', () => {
		expect(parseTotalsCap(null)).toBeNull();
		expect(parseTotalsCap('   ')).toBeNull();
		expect(capOvertimeMinutes(300, 480, null)).toBe(300);
	});

	it('the cap is a percent from 0 up; anything else is no cap', () => {
		expect(parseTotalsCap('25')).toBe(25);
		expect(parseTotalsCap('12.5')).toBe(12.5);
		expect(parseTotalsCap('0')).toBe(0);
		expect(parseTotalsCap('-5')).toBeNull();
		expect(parseTotalsCap('abc')).toBeNull();
	});

	it('the multiplier comes from the pattern version, not from the code', () => {
		const versions: PayRuleVersion[] = [
			{
				effectiveFrom: '2026-01-01',
				effectiveTo: null,
				otEnabled: pattern.otEnabled,
				workDayRate: pattern.workDayRate,
				offDayRate: null,
				holidayRate: null
			}
		];
		const resolved = resolvePayRule(versions, '2026-11-10');
		expect(resolved.rule.workDayRate).toBe(1.2);
		expect(resolved.sources.workDayRate).toBe('pattern');
		expect(resolved.sources.offDayRate).toBe('default');
		expect(overtimePay('work', 60, resolved.rule).rate).toBe(1.2);
	});
});

describe('the person sheet (R2)', () => {
	// A made-up person with four made-up days, in shuffled order.
	const days: PersonDay[] = [
		{
			shiftDate: '2026-11-04',
			shift: null,
			requiredMinutes: 0,
			workedMinutes: 120,
			overtimeMinutes: 120,
			paidOtMinutes: 0,
			unpaidExtraMinutes: 120,
			unpaidReason: 'ot_off',
			otRate: null,
			lateMinutes: 0,
			shortageMinutes: 0
		},
		{
			shiftDate: '2026-11-02',
			shift: { code: 'A1', nameEn: 'Made-up A', nameAr: 'وردية وهمية أ' },
			requiredMinutes: 480,
			workedMinutes: 540,
			overtimeMinutes: 60,
			paidOtMinutes: 60,
			unpaidExtraMinutes: 0,
			unpaidReason: null,
			otRate: 1.2,
			lateMinutes: 0,
			shortageMinutes: 0
		},
		{
			shiftDate: '2026-11-05',
			shift: { code: 'A1', nameEn: 'Made-up A', nameAr: 'وردية وهمية أ' },
			requiredMinutes: 480,
			workedMinutes: 300,
			overtimeMinutes: 0,
			paidOtMinutes: 0,
			unpaidExtraMinutes: 30,
			unpaidReason: 'absence',
			otRate: null,
			lateMinutes: 0,
			shortageMinutes: 180
		},
		{
			shiftDate: '2026-11-03',
			shift: { code: 'B2', nameEn: 'Made-up B', nameAr: 'وردية وهمية ب' },
			requiredMinutes: 480,
			workedMinutes: 480,
			overtimeMinutes: 0,
			paidOtMinutes: 0,
			unpaidExtraMinutes: 0,
			unpaidReason: null,
			otRate: null,
			lateMinutes: 15,
			shortageMinutes: 0
		}
	];

	it('oldest first: overtime and reason per day', () => {
		const rows = personDayRows(days, 'asc');
		expect(rows.map((r) => r.shiftDate)).toEqual([
			'2026-11-02',
			'2026-11-03',
			'2026-11-04',
			'2026-11-05'
		]);
		expect(rows.map((r) => [r.paidOtMinutes, r.unpaidExtraMinutes])).toEqual([
			[60, 0],
			[0, 0],
			[0, 120],
			[0, 30]
		]);
		expect(rows.map((r) => r.reason)).toEqual(['paid', 'none', 'ot_off', 'absence']);
	});

	it('newest first reverses the same rows', () => {
		const rows = personDayRows(days, 'desc');
		expect(rows.map((r) => r.shiftDate)).toEqual([
			'2026-11-05',
			'2026-11-04',
			'2026-11-03',
			'2026-11-02'
		]);
		expect(rows[3].reason).toBe('paid');
	});

	it('a day with no shift keeps no shift', () => {
		expect(personDayRows(days, 'asc')[2].shift).toBeNull();
	});
});

describe('pay: day rate and base pay (R6, partial)', () => {
	it('a monthly salary of 3000 gives a day rate of 100', () => {
		expect(dayRateOf(3000)).toBe(100);
	});

	it('the base pay is the day rate times the work days', () => {
		// A made-up person with 22 work days in the range.
		expect(basePayOf(3000, 22)).toBe(2200);
		expect(basePayOf(3000, 0)).toBe(0);
	});
});

describe('overtime and shortage coefficients (R6, RP19–RP23)', () => {
	// Made-up days: a 8-hour shift (480 required) and a 9-hour shift (540 required).
	it('a shift that crosses midnight counts its real hours', () => {
		expect(shiftHoursOf('22:00:00', '06:00:00', true)).toBe(8);
		expect(shiftHoursOf('08:00:00', '17:00:00', false)).toBe(9);
	});

	it('two rosters: each day divides by its own hours, and the total is exact', () => {
		const days = [
			{ requiredMinutes: 480, shiftHours: 8, paidOtMinutes: 60, otRate: 1.2, shortageMinutes: 0 },
			{ requiredMinutes: 540, shiftHours: 9, paidOtMinutes: 0, otRate: null, shortageMinutes: 90 }
		];
		const c = payCoefficients(days, null);
		// 60 min × 1.2 ÷ 8 h, and 90 min shortage ÷ 9 h: a salary of 3000 (day rate 100) gives 15 and 16.67.
		expect(c.overtime * 100).toBeCloseTo(15, 6);
		expect(c.shortage * 100).toBeCloseTo(16.6667, 3);
	});

	it('a cap that cuts is pro-rata: each day keeps its share and its own multiplier', () => {
		const days = [
			{ requiredMinutes: 480, shiftHours: 8, paidOtMinutes: 60, otRate: 1.2, shortageMinutes: 0 },
			{ requiredMinutes: 540, shiftHours: 9, paidOtMinutes: 120, otRate: 1.5, shortageMinutes: 0 }
		];
		// Required 1020 × 10 % = 102 of 180 eligible: each day keeps 102 ÷ 180.
		const c = payCoefficients(days, 10);
		expect(c.cappedMinutes).toBe(102);
		const share = 102 / 180;
		expect(c.overtime).toBeCloseTo(share * ((60 * 1.2) / (60 * 8) + (120 * 1.5) / (60 * 9)), 9);
	});

	it('an off day with no shift has no hour rate: not eligible, not deducted', () => {
		const days = [
			{ requiredMinutes: 0, shiftHours: null, paidOtMinutes: 60, otRate: 1.5, shortageMinutes: 30 }
		];
		expect(payCoefficients(days, null)).toEqual({
			overtime: 0,
			shortage: 0,
			eligibleMinutes: 0,
			cappedMinutes: 0
		});
	});

	it('an off day with a shift worked uses that shift’s hours', () => {
		const days = [
			{ requiredMinutes: 0, shiftHours: 8, paidOtMinutes: 60, otRate: 1.5, shortageMinutes: 0 }
		];
		expect(payCoefficients(days, null).overtime * 100).toBeCloseTo(18.75, 6);
	});
});
