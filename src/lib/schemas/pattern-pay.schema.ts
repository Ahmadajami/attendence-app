import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { daysBetween } from '#lib/roster/cycle.js';

// A pattern's overtime pay rule, holidays and missions (pay plan PR1–PR15, task 4.1), and the
// company's own rule and holidays (PR35, PR36: the same forms with `patternId` ''). Dates are
// `yyyy-mm-dd` strings; how far back (pay rules, B7b) is the service's check.

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });

const reason = z
	.string()
	.trim()
	.min(1, { error: () => m.roster_reason_required() })
	.max(500);

const holidayName = z
	.string()
	.trim()
	.min(1, { error: () => m.pattern_holiday_name_required() })
	.max(120);

/** Rates are multipliers of the person's own hourly pay (PR1): 1.00–5.00, two decimals (PR6). */
export const MIN_RATE = 1;
export const MAX_RATE = 5;

/** The longest holiday, in days (the `pattern_holiday_dates` check). */
export const MAX_HOLIDAY_DAYS = 14;

const hasTwoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

/** A rate, or `null`: inherit from the next level (PR4). An emptied number input posts `null`. */
const rate = z
	.number({ error: () => m.pattern_pay_rate_invalid({ min: '1.00', max: '5.00' }) })
	.min(MIN_RATE, { error: () => m.pattern_pay_rate_invalid({ min: '1.00', max: '5.00' }) })
	.max(MAX_RATE, { error: () => m.pattern_pay_rate_invalid({ min: '1.00', max: '5.00' }) })
	.refine(hasTwoDecimals, { error: () => m.pattern_pay_rate_invalid({ min: '1.00', max: '5.00' }) })
	.nullable()
	.default(null);

/** The pattern, or `''`: the company's own rule or holiday (PR35, PR36). */
const owner = z
	.union([z.literal(''), z.uuid({ error: () => m.patterns_error_not_found() })])
	.default('');

/** Overtime on, off, or inherit (the form's three choices for `ot_enabled`, `null` = inherit). */
export const OT_CHOICES = ['inherit', 'on', 'off'] as const;
export type OtChoice = (typeof OT_CHOICES)[number];

/** `ot_enabled` of a choice. */
export const otEnabledOf = (choice: OtChoice): boolean | null =>
	choice === 'inherit' ? null : choice === 'on';

/** A new pay-rule version from a date (PR5): at least one value; the rest inherit. */
export const payRuleFormSchema = z
	.object({
		patternId: owner,
		otEnabled: z.enum(OT_CHOICES).default('inherit'),
		workDayRate: rate,
		offDayRate: rate,
		holidayRate: rate,
		effectiveFrom: isoDate,
		reason
	})
	.superRefine((value, ctx) => {
		if (
			value.otEnabled === 'inherit' &&
			value.workDayRate === null &&
			value.offDayRate === null &&
			value.holidayRate === null
		)
			ctx.addIssue({ code: 'custom', path: ['otEnabled'], message: m.pattern_pay_needs_value() });
	});
export type PayRuleFormSchema = typeof payRuleFormSchema;
export type PayRuleInput = z.infer<PayRuleFormSchema>;

/** Go back to the defaults from a date: the version in force ends, later ones are removed. */
export const payRuleResetSchema = z.object({
	patternId: owner,
	effectiveFrom: isoDate,
	reason
});
export type PayRuleResetSchema = typeof payRuleResetSchema;
export type PayRuleResetInput = z.infer<PayRuleResetSchema>;

/** `startsOn` to `endsOn` inclusive: in order, and at most `limit.max` days when given. */
export function checkDateRange(
	value: { startsOn: string; endsOn: string },
	ctx: z.RefinementCtx,
	limit?: { max: number; message: () => string }
) {
	if (value.endsOn < value.startsOn) {
		ctx.addIssue({ code: 'custom', path: ['endsOn'], message: m.pattern_dates_order() });
		return;
	}
	if (limit && daysBetween(value.startsOn, value.endsOn) + 1 > limit.max)
		ctx.addIssue({ code: 'custom', path: ['endsOn'], message: limit.message() });
}

/**
 * A holiday for everyone who follows the pattern (PR2, PR3, PR8), or for every pattern (`patternId`
 * '', PR36); past dates allowed (PR11).
 */
export const holidayFormSchema = z
	.object({
		patternId: owner,
		startsOn: isoDate,
		endsOn: isoDate,
		nameEn: holidayName,
		nameAr: holidayName,
		otEligible: z.boolean().default(false),
		reason
	})
	.superRefine((value, ctx) =>
		checkDateRange(value, ctx, {
			max: MAX_HOLIDAY_DAYS,
			message: () => m.pattern_holiday_too_long({ max: MAX_HOLIDAY_DAYS })
		})
	);
export type HolidayFormSchema = typeof holidayFormSchema;
export type HolidayInput = z.infer<HolidayFormSchema>;

export const holidayCancelSchema = z.object({
	holidayId: z.uuid({ error: () => m.pattern_holiday_error_not_found() }),
	reason
});
export type HolidayCancelSchema = typeof holidayCancelSchema;
export type HolidayCancelInput = z.infer<HolidayCancelSchema>;

/**
 * How a pattern treats one company holiday (PR36): it applies or is skipped; its overtime switch is
 * the company's (`inherit`) or the pattern's own.
 */
export const holidayExceptionSchema = z.object({
	patternId: z.uuid({ error: () => m.patterns_error_not_found() }),
	holidayId: z.uuid({ error: () => m.pattern_holiday_error_not_found() }),
	applies: z.boolean().default(true),
	otEligible: z.enum(OT_CHOICES).default('inherit'),
	reason
});
export type HolidayExceptionSchema = typeof holidayExceptionSchema;
export type HolidayExceptionInput = z.infer<HolidayExceptionSchema>;

/**
 * A full-day mission for the members HR picks (PR2, PR9, PR10): one `absence` of type `mission`
 * per member, sharing a group id. Posted as JSON (the member list).
 */
export const missionFormSchema = z
	.object({
		patternId: z.uuid({ error: () => m.patterns_error_not_found() }),
		startsOn: isoDate,
		endsOn: isoDate,
		staffIds: z
			.array(z.uuid())
			.min(1, { error: () => m.pattern_mission_members_required() })
			.max(500)
			.default([]),
		reason
	})
	.superRefine((value, ctx) => checkDateRange(value, ctx));
export type MissionFormSchema = typeof missionFormSchema;
export type MissionInput = z.infer<MissionFormSchema>;

/** Cancel a whole mission (`staffId` `''`) or one member's part of it. */
export const missionCancelSchema = z.object({
	groupId: z.uuid({ error: () => m.pattern_mission_error_not_found() }),
	staffId: z.union([z.literal(''), z.uuid()]).default(''),
	reason
});
export type MissionCancelSchema = typeof missionCancelSchema;
export type MissionCancelInput = z.infer<MissionCancelSchema>;

/** Superforms status message of the pattern pay forms. */
export type { StatusMessage as PatternPayMessage } from '#lib/utils/form-toasts.js';
