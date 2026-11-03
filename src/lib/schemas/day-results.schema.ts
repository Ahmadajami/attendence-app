import { z } from 'zod';
import { MAX_PERSON_SEARCH } from '#lib/attendance/person-search.js';
import { m } from '#lib/paraglide/messages.js';

// Recompute the stored daily attendance from a date to today (pay plan task 3.3). The range check
// (today at the latest, at most `MAX_BACKFILL_DAYS`) is the service's.

export const recomputeFromSchema = z.object({
	from: z.iso.date({ error: () => m.roster_date_invalid() })
});
export type RecomputeFromSchema = typeof recomputeFromSchema;
export type RecomputeFromInput = z.infer<RecomputeFromSchema>;

/**
 * The daily page's "Source" filter (pay plan PR20, PR24): where a day's counted in / out times came
 * from. `corrected`: a counted time was corrected. Matches either time.
 */
export const DAILY_SOURCES = ['typed', 'punch_reading', 'odoo_seed', 'corrected'] as const;
export type DailySource = (typeof DAILY_SOURCES)[number];

/** The daily page's range (PR41, PR44): the last 7 days by default; any range the user picks. */
export const DEFAULT_DAILY_DAYS = 7;

/** Recompute the daily page's shown range, scope and person search (pay plan task 5.2, PR42). */
export const recomputeDaysSchema = z.object({
	from: z.iso.date({ error: () => m.roster_date_invalid() }),
	to: z.iso.date({ error: () => m.roster_date_invalid() }),
	/** The page's `scope` parameter: `department:<id>`, `team:<id>` or '' (everyone). */
	scope: z.string().max(80).default(''),
	/** The page's `q` parameter (PR42): the person search, '' for none. */
	q: z.string().max(MAX_PERSON_SEARCH).default('')
});
export type RecomputeDaysInput = z.infer<typeof recomputeDaysSchema>;
