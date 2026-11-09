import { parseDate, parseTime, toCalendarDateTime } from '@internationalized/date';
import {
	crossesMidnight,
	isNight,
	parseClock,
	requiredMinutes,
	spanMinutes
} from '#lib/payroll/schedule.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/timezone.js';
import { LATE_GRACE_MINUTES } from './rules.js';

/**
 * The engine's view of a `shift` row (also what pages get, so it stays serialisable). Times are
 * Damascus wall-clock `HH:MM:SS`.
 */
export type RosterShift = {
	id: string;
	code: string;
	nameEn: string;
	nameAr: string;
	colour: string;
	startTime: string;
	endTime: string;
	breakMinutes: number;
	requiredMinutes: number | null;
	windowBeforeMinutes: number;
	windowAfterMinutes: number;
	graceMinutes: number;
	active: boolean;
};

type ShiftTimes = Pick<RosterShift, 'startTime' | 'endTime'>;

/** A half-open span `[start, end)` in time. */
export type TimeWindow = { start: Date; end: Date };

const MINUTE = 60_000;

/** The shift's length in minutes, overnight-safe. */
export function spanOf(shift: ShiftTimes): number {
	return spanMinutes(parseClock(shift.startTime), parseClock(shift.endTime));
}

/** True when the shift ends on the day after its shift date. */
export function endsNextDay(shift: ShiftTimes): boolean {
	return crossesMidnight(parseClock(shift.startTime), parseClock(shift.endTime));
}

/** Night shift by the default 22:00 → 06:00 window (plan P6). */
export function isNightShift(shift: ShiftTimes): boolean {
	return isNight(parseClock(shift.startTime), parseClock(shift.endTime));
}

/** The minutes a rostered shift requires: the override, else span − break. */
export function requiredOf(
	shift: Pick<RosterShift, 'startTime' | 'endTime' | 'breakMinutes' | 'requiredMinutes'>
): number {
	return shift.requiredMinutes ?? requiredMinutes(spanOf(shift), shift.breakMinutes);
}

/** Late after this many minutes: the shift's grace, or the default when it has none (0). */
export function graceOf(shift: Pick<RosterShift, 'graceMinutes'>): number {
	return shift.graceMinutes > 0 ? shift.graceMinutes : LATE_GRACE_MINUTES;
}

/**
 * The shift's span on its shift date: the start is wall-clock time on `date` in `timeZone`, the end
 * is the span later, so a shift that ends the next day ends the next morning.
 */
export function shiftWindow(
	date: string,
	shift: ShiftTimes,
	timeZone: string = AIRPORT_TIME_ZONE
): TimeWindow {
	const start = toCalendarDateTime(parseDate(date), parseTime(shift.startTime)).toDate(timeZone);
	return { start, end: new Date(start.getTime() + spanOf(shift) * MINUTE) };
}

/** When a punch counts for this shift: from `window_before` before its start to `window_after` after its end. */
export function attributionWindow(
	date: string,
	shift: ShiftTimes & Pick<RosterShift, 'windowBeforeMinutes' | 'windowAfterMinutes'>,
	timeZone: string = AIRPORT_TIME_ZONE
): TimeWindow {
	const { start, end } = shiftWindow(date, shift, timeZone);
	return {
		start: new Date(start.getTime() - shift.windowBeforeMinutes * MINUTE),
		end: new Date(end.getTime() + shift.windowAfterMinutes * MINUTE)
	};
}
