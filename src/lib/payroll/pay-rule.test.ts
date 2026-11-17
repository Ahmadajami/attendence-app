import { describe, expect, it } from 'vitest';
import {
	NIGHT_RATE_DEFAULT,
	NIGHT_RATE_DEFAULT_DATE,
	OVERTIME_DEFAULTS,
	overtimePay,
	resolvePayRule,
	type PayRuleVersion
} from './pay-rule.js';

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
	it('T1: no pay rule on the pattern or the company → built-in defaults', () => {
		const { rule, sources } = resolvePayRule([], '2026-11-02');
		expect(rule).toEqual({
			otEnabled: true,
			workDayRate: 1.25,
			offDayRate: 1.5,
			holidayRate: 1.5,
			nightRate: NIGHT_RATE_DEFAULT
		});
		expect(Object.values(sources)).toEqual(['default', 'default', 'default', 'default', 'default']);
	});

	it('T2: the pattern sets only the off-day rate', () => {
		const { rule, sources } = resolvePayRule(
			[version({ offDayRate: 2 }, '2026-01-01')],
			'2026-11-02'
		);
		expect(rule).toEqual({ ...OVERTIME_DEFAULTS, offDayRate: 2, nightRate: NIGHT_RATE_DEFAULT });
		expect(sources).toEqual({
			otEnabled: 'default',
			workDayRate: 'default',
			offDayRate: 'pattern',
			holidayRate: 'default',
			nightRate: 'default'
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

describe('resolvePayRule with the company setting (PR35)', () => {
	const company = [version({ otEnabled: false, workDayRate: 1.75 }, '2026-01-01')];

	it('takes the company values where the pattern sets nothing', () => {
		const { rule, sources } = resolvePayRule([], '2026-11-02', company);
		expect(rule).toEqual({
			...OVERTIME_DEFAULTS,
			otEnabled: false,
			workDayRate: 1.75,
			nightRate: NIGHT_RATE_DEFAULT
		});
		expect(sources).toEqual({
			otEnabled: 'company',
			workDayRate: 'company',
			offDayRate: 'default',
			holidayRate: 'default',
			nightRate: 'default'
		});
	});

	it('lets the pattern win over the company, field by field', () => {
		const pattern = [version({ workDayRate: 2, otEnabled: true }, '2026-06-01')];
		const { rule, sources } = resolvePayRule(pattern, '2026-11-02', company);
		expect(rule).toEqual({
			...OVERTIME_DEFAULTS,
			otEnabled: true,
			workDayRate: 2,
			nightRate: NIGHT_RATE_DEFAULT
		});
		expect(sources.otEnabled).toBe('pattern');
		expect(sources.workDayRate).toBe('pattern');
		expect(sources.offDayRate).toBe('default');
	});

	it('follows the company version in force on the date', () => {
		const versions = [
			version({ holidayRate: 2 }, '2026-01-01', '2026-11-10'),
			version({ holidayRate: 3 }, '2026-11-10')
		];
		expect(resolvePayRule([], '2026-11-09', versions).rule.holidayRate).toBe(2);
		expect(resolvePayRule([], '2026-11-10', versions).rule.holidayRate).toBe(3);
		expect(resolvePayRule([], '2025-12-31', versions).sources.holidayRate).toBe('default');
	});
});

describe('the dated night factor (TP29, TP33)', () => {
	it('B2.3.N1: 24 October resolves no night rate even when versions store one', () => {
		const pattern = [version({ nightRate: 2, workDayRate: 1.4 }, '2026-01-01')];
		const company = [version({ nightRate: 1.9, offDayRate: 1.8 }, '2026-01-01')];
		const { rule, sources } = resolvePayRule(pattern, '2026-10-24', company);
		expect(rule.nightRate).toBeNull();
		expect(sources.nightRate).toBe('default');
		// The three existing categories keep their stored values on that date.
		expect(rule.workDayRate).toBe(1.4);
		expect(rule.offDayRate).toBe(1.8);
	});

	it('B2.3.N2: from 25 October the night rate defaults to 1.50 and stays later', () => {
		expect(NIGHT_RATE_DEFAULT_DATE).toBe('2026-10-25');
		expect(NIGHT_RATE_DEFAULT).toBe(1.5);
		for (const date of ['2026-10-25', '2026-11-01', '2027-03-01']) {
			const { rule, sources } = resolvePayRule([], date);
			expect(rule.nightRate).toBe(1.5);
			expect(sources.nightRate).toBe('default');
		}
	});

	it('B2.3.N3: the pattern night value wins, an empty one falls through to the company', () => {
		const company = [version({ nightRate: 1.9 }, '2026-10-25')];
		const pattern = [version({ nightRate: 2.1 }, '2026-10-25')];
		expect(resolvePayRule(pattern, '2026-10-25', company)).toMatchObject({
			rule: { nightRate: 2.1 },
			sources: { nightRate: 'pattern' }
		});
		// An explicit null and an omitted field both inherit the company value.
		expect(
			resolvePayRule([version({ nightRate: null }, '2026-10-25')], '2026-10-25', company)
		).toMatchObject({ rule: { nightRate: 1.9 }, sources: { nightRate: 'company' } });
		expect(resolvePayRule([version({}, '2026-10-25')], '2026-10-25', company)).toMatchObject({
			rule: { nightRate: 1.9 },
			sources: { nightRate: 'company' }
		});
	});

	it('B2.3.N4: neither level sets it → the 1.50 default', () => {
		const company = [version({ nightRate: null, workDayRate: 1.4 }, '2026-10-25')];
		const pattern = [version({}, '2026-10-25')];
		expect(resolvePayRule(pattern, '2026-10-25', company)).toMatchObject({
			rule: { nightRate: 1.5, workDayRate: 1.4 },
			sources: { nightRate: 'default', workDayRate: 'company' }
		});
	});

	it('B2.3.N5: a later version editing another field inherits 1.50, not the expired night rate', () => {
		const company = [
			version({ nightRate: 1.8 }, '2026-10-25', '2026-11-10'),
			version({ workDayRate: 1.4 }, '2026-11-10')
		];
		const { rule, sources } = resolvePayRule([], '2026-11-10', company);
		expect(rule.nightRate).toBe(1.5);
		expect(sources.nightRate).toBe('default');
		expect(rule.workDayRate).toBe(1.4);
		expect(sources.workDayRate).toBe('company');
	});

	it('B2.3.N6: exact active-version boundaries at both levels', () => {
		const company = [
			version({ nightRate: 1.7 }, '2026-10-25', '2026-11-10'),
			version({ nightRate: 1.8 }, '2026-11-10')
		];
		expect(resolvePayRule([], '2026-10-24', company).rule.nightRate).toBeNull();
		expect(resolvePayRule([], '2026-10-25', company).rule.nightRate).toBe(1.7);
		expect(resolvePayRule([], '2026-11-09', company).rule.nightRate).toBe(1.7);
		expect(resolvePayRule([], '2026-11-10', company).rule.nightRate).toBe(1.8);
		const pattern = [
			version({ nightRate: 2 }, '2026-10-24', '2026-10-28'),
			version({ nightRate: 2.2 }, '2026-10-28')
		];
		expect(resolvePayRule(pattern, '2026-10-23').rule.nightRate).toBeNull();
		expect(resolvePayRule(pattern, '2026-10-24').rule.nightRate).toBeNull();
		expect(resolvePayRule(pattern, '2026-10-25').rule.nightRate).toBe(2);
		expect(resolvePayRule(pattern, '2026-10-27').rule.nightRate).toBe(2);
		expect(resolvePayRule(pattern, '2026-10-28').rule.nightRate).toBe(2.2);
	});

	it('B2.3.N7: historical values and an explicit overtime-off survive the boundary', () => {
		const versions = [
			version(
				{ otEnabled: false, workDayRate: 1.75, offDayRate: 1.9, holidayRate: 2.1 },
				'2026-01-01'
			)
		];
		for (const date of ['2026-10-24', '2026-10-25', '2026-11-02']) {
			const { rule, sources } = resolvePayRule(versions, date);
			expect(rule).toMatchObject({
				otEnabled: false,
				workDayRate: 1.75,
				offDayRate: 1.9,
				holidayRate: 2.1
			});
			expect(sources).toMatchObject({
				otEnabled: 'pattern',
				workDayRate: 'pattern',
				offDayRate: 'pattern',
				holidayRate: 'pattern'
			});
			expect(rule.nightRate).toBe(date < NIGHT_RATE_DEFAULT_DATE ? null : 1.5);
		}
	});

	it('B2.3.N8: frozen fixtures are not mutated', () => {
		const pattern = Object.freeze([
			Object.freeze(version({ nightRate: 2, workDayRate: 1.4 }, '2026-01-01'))
		]);
		const company = Object.freeze([Object.freeze(version({ nightRate: 1.8 }, '2026-01-01'))]);
		const { rule } = resolvePayRule(pattern, '2026-11-02', company);
		expect(rule.nightRate).toBe(2);
		expect(pattern[0].nightRate).toBe(2);
		expect(company[0].nightRate).toBe(1.8);
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
