import { fromDate, parseDate, toCalendarDate } from '@internationalized/date';
import { slotIndex } from '#lib/payroll/schedule.js';
import type { Pattern, PatternAssignment } from '#lib/server/db/schema/index.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/datetime.js';

/** What decides a pattern's slot on a date. */
export type SlotPattern = Pick<Pattern, 'type' | 'slots'> & Pick<PatternAssignment, 'anchorDate'>;

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (`YYYY-MM-DD`), negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return Math.round(
		(parseDate(to).toDate('UTC').getTime() - parseDate(from).toDate('UTC').getTime()) / DAY_MS
	);
}

/** `date` plus `days` calendar days, as `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
	return parseDate(date).add({ days }).toString();
}

/** The Damascus calendar date of an instant, as `YYYY-MM-DD`. */
export function damascusDate(at: Date): string {
	return toCalendarDate(fromDate(at, AIRPORT_TIME_ZONE)).toString();
}

/** 00:00 Damascus on `date`. */
export function startOfDamascusDay(date: string): Date {
	return parseDate(date).toDate(AIRPORT_TIME_ZONE);
}

/**
 * The shift id a pattern says for `date` (`null`: off). Weekly patterns go by weekday (Sunday
 * first); cycles by days since the anchor, repeating both ways.
 */
export function patternSlot(pattern: SlotPattern, date: string): string | null {
	return (
		pattern.slots[slotIndex(pattern.type, pattern.slots.length, date, pattern.anchorDate)] ?? null
	);
}
