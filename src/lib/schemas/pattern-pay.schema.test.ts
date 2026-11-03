import { describe, expect, it } from 'vitest';
import {
	holidayExceptionSchema,
	holidayFormSchema,
	missionCancelSchema,
	missionFormSchema,
	otEnabledOf,
	payRuleFormSchema,
	payRuleResetSchema
} from './pattern-pay.schema.js';

// Made-up ids (CLAUDE.md §1).
const patternId = '00000000-0000-4000-8000-000000000001';
const personA = '00000000-0000-4000-8000-000000000002';
const personB = '00000000-0000-4000-8000-000000000003';

const rule = {
	patternId,
	otEnabled: 'inherit' as const,
	workDayRate: null,
	offDayRate: 2,
	holidayRate: null,
	effectiveFrom: '2026-12-01',
	reason: 'New rates'
};

const errorPaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
	result.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('payRuleFormSchema', () => {
	it('accepts one value with the rest inherited (empty = inherit)', () => {
		const parsed = payRuleFormSchema.parse(rule);
		expect(parsed.workDayRate).toBeNull();
		expect(parsed.offDayRate).toBe(2);
	});

	it('accepts rates from 1.00 to 5.00 with two decimals', () => {
		for (const value of [1, 1.25, 4.99, 5])
			expect(payRuleFormSchema.safeParse({ ...rule, workDayRate: value }).success).toBe(true);
	});

	it('refuses rates outside 1.00–5.00 or with three decimals', () => {
		for (const value of [0.99, 5.01, 1.255, 0]) {
			const result = payRuleFormSchema.safeParse({ ...rule, workDayRate: value });
			expect(errorPaths(result)).toContain('workDayRate');
		}
	});

	it('needs at least one value: all inherit is a reset, not a version', () => {
		const result = payRuleFormSchema.safeParse({ ...rule, offDayRate: null });
		expect(errorPaths(result)).toEqual(['otEnabled']);
		expect(
			payRuleFormSchema.safeParse({ ...rule, offDayRate: null, otEnabled: 'off' }).success
		).toBe(true);
	});

	it('needs a real date and a reason', () => {
		expect(
			errorPaths(payRuleFormSchema.safeParse({ ...rule, effectiveFrom: '2026-02-30' }))
		).toEqual(['effectiveFrom']);
		expect(errorPaths(payRuleFormSchema.safeParse({ ...rule, reason: '  ' }))).toEqual(['reason']);
	});

	it('maps the overtime choice to ot_enabled', () => {
		expect(otEnabledOf('inherit')).toBeNull();
		expect(otEnabledOf('on')).toBe(true);
		expect(otEnabledOf('off')).toBe(false);
	});
});

describe('the company forms (patternId "", PR35, PR36)', () => {
	it('accepts the company as owner', () => {
		expect(payRuleFormSchema.safeParse({ ...rule, patternId: '' }).success).toBe(true);
		expect(holidayFormSchema.safeParse({ ...holiday, patternId: '' }).success).toBe(true);
	});
});

describe('holidayExceptionSchema', () => {
	const exception = {
		patternId,
		holidayId: '00000000-0000-4000-8000-000000000010',
		applies: false,
		otEligible: 'inherit' as const,
		reason: 'Crew works it'
	};
	it('skips, or changes the overtime switch, with a reason', () => {
		expect(holidayExceptionSchema.safeParse(exception).success).toBe(true);
		expect(
			holidayExceptionSchema.safeParse({ ...exception, applies: true, otEligible: 'on' }).success
		).toBe(true);
		expect(holidayExceptionSchema.safeParse({ ...exception, reason: '' }).success).toBe(false);
		expect(holidayExceptionSchema.safeParse({ ...exception, patternId: '' }).success).toBe(false);
	});
});

describe('payRuleResetSchema', () => {
	it('needs the pattern, a date and a reason', () => {
		expect(
			payRuleResetSchema.safeParse({ patternId, effectiveFrom: '2026-12-01', reason: 'Back' })
				.success
		).toBe(true);
		expect(
			payRuleResetSchema.safeParse({ patternId, effectiveFrom: '', reason: 'Back' }).success
		).toBe(false);
	});
});

const holiday = {
	patternId,
	startsOn: '2026-12-24',
	endsOn: '2026-12-25',
	nameEn: 'Winter break',
	nameAr: 'عطلة الشتاء',
	otEligible: true,
	reason: 'Yearly'
};

describe('holidayFormSchema', () => {
	it('accepts one day and up to 14 days', () => {
		expect(holidayFormSchema.safeParse({ ...holiday, endsOn: holiday.startsOn }).success).toBe(
			true
		);
		expect(holidayFormSchema.safeParse({ ...holiday, endsOn: '2027-01-06' }).success).toBe(true);
	});

	it('refuses an end before the start, and more than 14 days', () => {
		expect(errorPaths(holidayFormSchema.safeParse({ ...holiday, endsOn: '2026-12-23' }))).toEqual([
			'endsOn'
		]);
		expect(errorPaths(holidayFormSchema.safeParse({ ...holiday, endsOn: '2027-01-07' }))).toEqual([
			'endsOn'
		]);
	});

	it('needs both names; overtime-eligible defaults to off', () => {
		expect(errorPaths(holidayFormSchema.safeParse({ ...holiday, nameAr: ' ' }))).toEqual([
			'nameAr'
		]);
		const rest: Partial<typeof holiday> = { ...holiday };
		delete rest.otEligible;
		expect(holidayFormSchema.parse(rest).otEligible).toBe(false);
	});
});

const mission = {
	patternId,
	startsOn: '2026-12-01',
	endsOn: '2026-12-03',
	staffIds: [personA, personB],
	reason: 'Training abroad'
};

describe('missionFormSchema', () => {
	it('accepts members over a date range', () => {
		expect(missionFormSchema.safeParse(mission).success).toBe(true);
	});

	it('needs at least one member', () => {
		expect(errorPaths(missionFormSchema.safeParse({ ...mission, staffIds: [] }))).toEqual([
			'staffIds'
		]);
	});

	it('refuses an end before the start', () => {
		expect(errorPaths(missionFormSchema.safeParse({ ...mission, endsOn: '2026-11-30' }))).toEqual([
			'endsOn'
		]);
	});
});

describe('missionCancelSchema', () => {
	it('cancels the whole mission ("") or one member', () => {
		const groupId = '00000000-0000-4000-8000-000000000009';
		expect(missionCancelSchema.parse({ groupId, reason: 'Called off' }).staffId).toBe('');
		expect(
			missionCancelSchema.safeParse({ groupId, staffId: personA, reason: 'Ill' }).success
		).toBe(true);
	});
});
