import { fromDate, parseDate, toCalendarDate } from '@internationalized/date';
import { slotIndex } from '#lib/payroll/schedule.js';
import type { PatternType } from '#lib/schemas/enums.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/timezone.js';

/**
 * What decides a pattern's slot on a date: the pattern's type and slots (shift ids, `null` = off),
 * and for a cycle the date its slot 0 falls on (the assignment's anchor).
 */
export type SlotPattern = {
	type: PatternType;
	slots: readonly (string | null)[];
	anchorDate: string | null;
};

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

/** The weekday of `date`: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
	return slotIndex('weekly', 7, date);
}

/**
 * The shift id a pattern says for `date` (`null`: off). Weekly patterns go by weekday (Sunday
 * first); cycles by days since the anchor, repeating both ways. A cycle's `crewStart` moves a
 * person that many slots further into it (builder plan B4), before the anchor too. Weekly patterns
 * ignore it.
 */
export function patternSlot(pattern: SlotPattern, date: string, crewStart = 0): string | null {
	const n = pattern.slots.length;
	const index = slotIndex(pattern.type, n, date, pattern.anchorDate);
	const shifted = pattern.type === 'cycle' ? (((index + crewStart) % n) + n) % n : index;
	return pattern.slots[shifted] ?? null;
}

/** The shift a pattern uses most (ties: the earliest slot); `null` when it has no shift. */
export function mostUsedShift(slots: readonly (string | null)[]): string | null {
	const counts = new Map<string, number>();
	for (const slot of slots) if (slot !== null) counts.set(slot, (counts.get(slot) ?? 0) + 1);
	let best: string | null = null;
	for (const [id, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = id;
	return best;
}
