import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

// Recompute the stored daily attendance from a date to today (pay plan task 3.3). The range check
// (today at the latest, at most `MAX_BACKFILL_DAYS`) is the service's.

export const recomputeFromSchema = z.object({
	from: z.iso.date({ error: () => m.roster_date_invalid() })
});
export type RecomputeFromSchema = typeof recomputeFromSchema;
export type RecomputeFromInput = z.infer<RecomputeFromSchema>;
