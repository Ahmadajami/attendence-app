import {
	fromDate,
	parseDate,
	parseTime,
	toCalendarDate,
	toCalendarDateTime
} from '@internationalized/date';
import type { ShiftKind } from '#lib/schemas/enums.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/datetime.js';
import { SHIFT_MINUTES } from './rules.js';

/** A shift that is worked, as opposed to a day off. */
export type WorkKind = Exclude<ShiftKind, 'off'>;

/** Wall-clock starts (`HH:mm` or `HH:mm:ss`, Damascus) of the Day and Night shifts. */
export type ShiftTimes = { dayStart: string; nightStart: string };

/** A shift's half-open span `[start, end)`. */
export type ShiftWindow = { start: Date; end: Date };

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

/** 0-based position of `date` in a cycle of `length` days whose day 1 is `anchor`; repeats both ways. */
export function cycleIndex(anchor: string, length: number, date: string): number {
	return ((daysBetween(anchor, date) % length) + length) % length;
}

/** What a cycle says for `date`. */
export function cycleKind(cycle: readonly ShiftKind[], anchor: string, date: string): ShiftKind {
	return cycle[cycleIndex(anchor, cycle.length, date)];
}

/**
 * The 12 h span of a Day or Night shift on its shift date. The start is Damascus wall-clock time on
 * `date`; the end is 12 h later, so a night ends the next morning.
 */
export function shiftWindow(date: string, kind: WorkKind, times: ShiftTimes): ShiftWindow {
	const time = parseTime(kind === 'day' ? times.dayStart : times.nightStart);
	const start = toCalendarDateTime(parseDate(date), time).toDate(AIRPORT_TIME_ZONE);
	return { start, end: new Date(start.getTime() + SHIFT_MINUTES * 60_000) };
}
