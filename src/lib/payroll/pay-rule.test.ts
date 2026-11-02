import { describe, expect, it } from 'vitest';
import { OVERTIME_DEFAULTS, overtimePay, resolvePayRule, type PayRuleVersion } from './pay-rule.js';

const version = (
	values: Partial<PayRuleVersion>,
	effectiveFrom: string,
	effectiveTo: string | null = null
): PayRuleVersion => ({
	otEnabled: null,
	workDayRate: null,
	offDayRate: null,
	holidayRate: null,
	...values,
	effectiveFrom,
	effectiveTo
});

describe('resolvePayRule', () => {
	it('T1: no pay rule on the pattern → company defaults', () => {
		const { rule, sources } = resolvePayRule([], '2026-11-02');
		expect(rule).toEqual({ otEnabled: true, workDayRate: 1.25, offDayRate: 1.5, holidayRate: 1.5 });
		expect(Object.values(sources)).toEqual(['company', 'company', 'company', 'company']);
	});

	it('T2: the pattern sets only the off-day rate', () => {
		const { rule, sources } = resolvePayRule(
			[version({ offDayRate: 2 }, '2026-01-01')],
			'2026-11-02'
		);
		expect(rule).toEqual({ ...OVERTIME_DEFAULTS, offDayRate: 2 });
		expect(sources).toEqual({
			otEnabled: 'company',
			workDayRate: 'company',
			offDayRate: 'pattern',
			holidayRate: 'company'
		});
	});

	it('T3: a version from the 10th applies from the 10th (effective_to exclusive)', () => {
		const versions = [
			version({ workDayRate: 1.25 }, '2026-01-01', '2026-11-10'),
			version({ workDayRate: 1.5 }, '2026-11-10')
		];
		expect(resolvePayRule(versions, '2026-11-09').rule.workDayRate).toBe(1.25);
		expect(resolvePayRule(versions, '2026-11-10').rule.workDayRate).toBe(1.5);
		expect(resolvePayRule(versions, '2027-03-01').rule.workDayRate).toBe(1.5);
	});

	it('keeps an explicit "overtime off" (false is a value, not inherit)', () => {
		const { rule, sources } = resolvePayRule(
			[version({ otEnabled: false }, '2026-01-01')],
			'2026-11-02'
		);
		expect(rule.otEnabled).toBe(false);
		expect(sources.otEnabled).toBe('pattern');
	});
});

describe('overtimePay', () => {
	const rule = OVERTIME_DEFAULTS;

	it('pays work-day overtime at the work-day rate', () => {
		expect(overtimePay('work', 60, rule)).toEqual({
			rate: 1.25,
			paidMinutes: 60,
			unpaidMinutes: 0,
			reason: null
		});
	});

	it('pays off-day work at the off-day rate and eligible holiday work at the holiday rate', () => {
		expect(overtimePay('off_work', 600, { ...rule, offDayRate: 2 }).rate).toBe(2);
		expect(overtimePay('holiday_work', 600, rule, { holidayOtEligible: true })).toMatchObject({
			rate: 1.5,
			paidMinutes: 600
		});
	});

	it('T4: overtime off → nothing paid, the minutes shown as unpaid', () => {
		expect(overtimePay('work', 60, { ...rule, otEnabled: false })).toEqual({
			rate: null,
			paidMinutes: 0,
			unpaidMinutes: 60,
			reason: 'ot_off'
		});
		// PR15: off-day work is not paid either.
		expect(overtimePay('off_work', 600, { ...rule, otEnabled: false }).reason).toBe('ot_off');
	});

	it('names the most specific reason first', () => {
		expect(overtimePay('absence', 300, rule).reason).toBe('absence');
		expect(overtimePay('work', 60, rule, { otEligible: false }).reason).toBe('person_no_ot');
		expect(
			overtimePay('holiday_work', 600, { ...rule, otEnabled: false }, { holidayOtEligible: false })
				.reason
		).toBe('holiday_not_eligible');
	});

	it('returns nothing without extra minutes or on days that are not worked', () => {
		const nothing = { rate: null, paidMinutes: 0, unpaidMinutes: 0, reason: null };
		expect(overtimePay('work', 0, rule)).toEqual(nothing);
		expect(overtimePay('off', 30, rule)).toEqual(nothing);
		expect(overtimePay('holiday_off', 30, rule)).toEqual(nothing);
	});
});
