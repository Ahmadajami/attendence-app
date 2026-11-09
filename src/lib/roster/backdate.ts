import { addDays } from './cycle.js';

// How far back a change "from a date" may start (builder plan B7b): assignments, a person's own
// schedule, pay rules and department managers, and the "Recompute from a date" backfill. Until
// payroll periods exist (S3.1) a past date is allowed with the form's reason, up to this limit; after
// S3.1 the open-period check (B7) replaces it. Client-safe: the date inputs use it for `min`.

/** The longest range one backfill may cover, in days (today included). */
export const MAX_BACKFILL_DAYS = 400;

/** The earliest start date allowed on `today` (`YYYY-MM-DD`). */
export function earliestEffectiveDate(today: string): string {
	return addDays(today, -(MAX_BACKFILL_DAYS - 1));
}

/** True when `date` is on or after `earliestEffectiveDate(today)` (any later date is fine). */
export function withinBackdateLimit(date: string, today: string): boolean {
	return date >= earliestEffectiveDate(today);
}
