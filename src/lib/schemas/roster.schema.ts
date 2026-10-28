import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { MAX_CYCLE_DAYS } from '#lib/roster/rules.js';
import { SHIFT_KINDS } from './enums.js';

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });

const reason = z
	.string()
	.trim()
	.min(1, { error: () => m.roster_reason_required() })
	.max(500);

/** A new cycle version for a team or a person, from `effectiveFrom` on. */
export const patternFormSchema = z.object({
	cycle: z
		.array(z.enum(SHIFT_KINDS))
		.min(1, { error: () => m.roster_cycle_empty() })
		.max(MAX_CYCLE_DAYS, { error: () => m.roster_cycle_too_long({ max: MAX_CYCLE_DAYS }) })
		.refine((cycle) => cycle.some((kind) => kind !== 'off'), {
			error: () => m.roster_cycle_needs_work()
		})
		.default(['day', 'night', 'off', 'off']),
	anchorDate: isoDate,
	effectiveFrom: isoDate,
	reason
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
