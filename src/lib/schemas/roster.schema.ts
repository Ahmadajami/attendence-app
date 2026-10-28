import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { WEEKLY_SLOTS } from '#lib/payroll/schedule.js';
import { MAX_CYCLE_DAYS } from '#lib/roster/rules.js';
import { PATTERN_TYPES } from './enums.js';

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });

const reason = z
	.string()
	.trim()
	.min(1, { error: () => m.roster_reason_required() })
	.max(500);

/**
 * A new pattern version for a team or a person, from `effectiveFrom` on. `slots` are shift ids,
 * `null` = off: 7 for `weekly` (Sunday first), 1–28 for `cycle`, whose slot 0 falls on
 * `anchorDate`. Posted as JSON (Superforms `dataType: 'json'`) so `null` survives.
 */
export const patternFormSchema = z
	.object({
		type: z.enum(PATTERN_TYPES).default('cycle'),
		slots: z
			.array(z.uuid().nullable())
			.min(1, { error: () => m.roster_cycle_empty() })
			.max(MAX_CYCLE_DAYS, { error: () => m.roster_cycle_too_long({ max: MAX_CYCLE_DAYS }) })
			.refine((slots) => slots.some((slot) => slot !== null), {
				error: () => m.roster_cycle_needs_work()
			}),
		/** Only for a cycle; ignored (stored as `null`) for a weekly pattern. */
		anchorDate: z.string(),
		effectiveFrom: isoDate,
		reason
	})
	.superRefine((value, ctx) => {
		if (value.type === 'weekly' && value.slots.length !== WEEKLY_SLOTS)
			ctx.addIssue({ code: 'custom', path: ['slots'], message: m.roster_weekly_days() });
		if (value.type === 'cycle' && !isoDate.safeParse(value.anchorDate).success)
			ctx.addIssue({ code: 'custom', path: ['anchorDate'], message: m.roster_date_invalid() });
	});
export type PatternFormSchema = typeof patternFormSchema;
export type PatternInput = z.infer<PatternFormSchema>;

/** End a person's own cycle, so they follow their team's again. */
export const endPatternFormSchema = z.object({ effectiveFrom: isoDate, reason });
export type EndPatternFormSchema = typeof endPatternFormSchema;
export type EndPatternInput = z.infer<EndPatternFormSchema>;

export const addSupervisorSchema = z.object({ staffId: z.uuid() });
export const removeSupervisorSchema = z.object({ supervisorId: z.uuid() });

/** Superforms status message of the roster forms. */
export type RosterMessage = { kind: 'success' | 'error'; text: string };
