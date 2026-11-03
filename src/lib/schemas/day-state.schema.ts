import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { checkDateRange } from './pattern-pay.schema.js';

// HR sets a day's state for one person over a date range, or clears it (pay plan PR19, Q-PR4;
// the service comes with task 5.1). Past dates allowed with a reason (PR11). A state is an
// `absence` row; its reason may hold health details, so it is never logged.

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });

const reason = z
	.string()
	.trim()
	.min(1, { error: () => m.roster_reason_required() })
	.max(500);

/** The states HR may set from the day editor (Q-PR4). */
export const DAY_STATES = ['leave', 'sick', 'mission', 'no_show', 'other'] as const;
export type DayState = (typeof DAY_STATES)[number];

/** The longest range one edit may cover, in days: a year. */
export const MAX_DAY_STATE_DAYS = 366;

const range = {
	staffId: z.uuid({ error: () => m.attendance_error_person() }),
	startsOn: isoDate,
	endsOn: isoDate,
	reason
};

const limit = {
	max: MAX_DAY_STATE_DAYS,
	message: () => m.day_state_too_long({ max: MAX_DAY_STATE_DAYS })
};

export const dayStateFormSchema = z
	.object({ ...range, state: z.enum(DAY_STATES).default('' as 'leave') })
	.superRefine((value, ctx) => checkDateRange(value, ctx, limit));
export type DayStateFormSchema = typeof dayStateFormSchema;
export type DayStateInput = z.infer<DayStateFormSchema>;

/** Clear the states on these dates: the person's days follow the roster again. */
export const dayStateClearSchema = z
	.object(range)
	.superRefine((value, ctx) => checkDateRange(value, ctx, limit));
export type DayStateClearSchema = typeof dayStateClearSchema;
export type DayStateClearInput = z.infer<DayStateClearSchema>;
