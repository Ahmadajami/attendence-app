import { addDays, daysBetween } from '#lib/roster/cycle.js';
import { DEFAULT_DAILY_DAYS } from '#lib/schemas/day-results.schema.js';

// The daily page's shown range (pay plan PR41, PR44). Pure, so it is tested without a database.

export type DailyRange = { from: string; to: string };

/**
 * The shown range: exactly the asked dates, never changed (PR44). Only a missing date gets a
 * default: `to` today, `from` six days before `to`.
 */
export function dailyRange(from: string | null, to: string | null, today: string): DailyRange {
	const end = to ?? today;
	return { from: from ?? addDays(end, -(DEFAULT_DAILY_DAYS - 1)), to: end };
}

/**
 * How many dates of `[from, to]` are on or before `today`: only those can have a stored record
 * (future days are not stored, PR18). 0 for an empty range (`from` after `to`).
 */
export function pastDays(from: string, to: string, today: string): number {
	const last = to < today ? to : today;
	return from > last ? 0 : daysBetween(from, last) + 1;
}
