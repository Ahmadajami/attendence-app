import type { DayKind, UnpaidReason } from '#lib/schemas/enums.js';

// Overtime rules of a pattern (pay plan PR4–PR7, PR15). Pure: no DB or SvelteKit imports.

/** Overtime on/off and the three rate multipliers of the person's own hourly pay (PR1, PR6). */
export type PayRule = {
	otEnabled: boolean;
	/** Minutes past the required time on a rostered work day. */
	workDayRate: number;
	/** Every minute worked on an off day or an extra shift. */
	offDayRate: number;
	/** Every minute worked on an overtime-eligible holiday. */
	holidayRate: number;
};

export type PayRuleField = keyof PayRule;

/**
 * The built-in default under the company setting (PR7, PR35): the old Odoo values (Q1: holiday 1.5,
 * the old behaviour). Used for every value neither the pattern nor the company sets.
 */
export const OVERTIME_DEFAULTS: Readonly<PayRule> = Object.freeze({
	otEnabled: true,
	workDayRate: 1.25,
	offDayRate: 1.5,
	holidayRate: 1.5
});

/** One `pattern_pay_rule` version: `null` in a field inherits (PR4). */
export type PayRuleVersion = { [K in PayRuleField]: PayRule[K] | null } & {
	effectiveFrom: string;
	/** Exclusive; `null` while open. */
	effectiveTo: string | null;
};

/**
 * Where a field's value came from (PR35): the pattern's rule, the company setting, or the built-in
 * default; `department` joins between pattern and company with S2.3.
 */
export type PayRuleSource = 'pattern' | 'company' | 'default';

export type ResolvedPayRule = {
	rule: PayRule;
	sources: Record<PayRuleField, PayRuleSource>;
};

const FIELDS = ['otEnabled', 'workDayRate', 'offDayRate', 'holidayRate'] as const;

/** The version in force on `date` (`effectiveTo` exclusive), if any. */
export function versionOn<V extends { effectiveFrom: string; effectiveTo: string | null }>(
	versions: readonly V[],
	date: string
): V | undefined {
	return versions.find(
		(v) => v.effectiveFrom <= date && (v.effectiveTo === null || date < v.effectiveTo)
	);
}

/**
 * The rule on `date`: each field from the pattern's version in force, else the company's version in
 * force (PR35), else the built-in default, with where each came from.
 */
export function resolvePayRule(
	patternVersions: readonly PayRuleVersion[],
	date: string,
	companyVersions: readonly PayRuleVersion[] = []
): ResolvedPayRule {
	const levels = [
		[versionOn(patternVersions, date), 'pattern'],
		[versionOn(companyVersions, date), 'company']
	] as const;
	const rule = { ...OVERTIME_DEFAULTS };
	const sources = {} as Record<PayRuleField, PayRuleSource>;
	for (const field of FIELDS) {
		sources[field] = 'default';
		for (const [version, source] of levels) {
			const value = version?.[field] ?? null;
			if (value === null) continue;
			(rule as Record<PayRuleField, PayRule[PayRuleField]>)[field] = value;
			sources[field] = source;
			break;
		}
	}
	return { rule, sources };
}

export type OvertimePay = {
	/** The multiplier the paid minutes earn; `null` when nothing is paid. */
	rate: number | null;
	paidMinutes: number;
	/** Extra minutes counted but not paid (PR3, PR15, PR19), always with a reason. */
	unpaidMinutes: number;
	reason: UnpaidReason | null;
};

const NOTHING: OvertimePay = { rate: null, paidMinutes: 0, unpaidMinutes: 0, reason: null };

/**
 * How a day's extra minutes are paid. `extraMinutes` is the day's rounded overtime (on off-day and
 * holiday work: every minute worked). The first reason that applies wins: a full-day absence, a
 * person without overtime (S3.6), a holiday that isn't overtime-eligible, overtime off.
 */
export function overtimePay(
	kind: DayKind,
	extraMinutes: number,
	rule: Readonly<PayRule>,
	options: { otEligible?: boolean; holidayOtEligible?: boolean } = {}
): OvertimePay {
	if (extraMinutes <= 0 || kind === 'off' || kind === 'holiday_off') return NOTHING;
	const unpaid = (reason: UnpaidReason): OvertimePay => ({
		rate: null,
		paidMinutes: 0,
		unpaidMinutes: extraMinutes,
		reason
	});
	if (kind === 'absence') return unpaid('absence');
	if (options.otEligible === false) return unpaid('person_no_ot');
	if (kind === 'holiday_work' && options.holidayOtEligible !== true)
		return unpaid('holiday_not_eligible');
	if (!rule.otEnabled) return unpaid('ot_off');
	const rate =
		kind === 'work' ? rule.workDayRate : kind === 'off_work' ? rule.offDayRate : rule.holidayRate;
	return { rate, paidMinutes: extraMinutes, unpaidMinutes: 0, reason: null };
}
