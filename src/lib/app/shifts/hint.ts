import {
	crossesMidnight,
	isNight,
	parseClock,
	requiredMinutes,
	spanMinutes
} from '#lib/payroll/schedule.js';

/** What the shift editor's live hint says about the times being typed. */
export type ShiftHint = {
	endsNextDay: boolean;
	spanMinutes: number;
	requiredMinutes: number;
	night: boolean;
};

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/** Figures for `start → end` (`HH:mm`), or `null` while either time is incomplete. */
export function shiftHint(
	start: string,
	end: string,
	breakMinutes: number | null,
	required: number | null
): ShiftHint | null {
	if (!CLOCK.test(start) || !CLOCK.test(end)) return null;
	const s = parseClock(start);
	const e = parseClock(end);
	const span = spanMinutes(s, e);
	return {
		endsNextDay: crossesMidnight(s, e),
		spanMinutes: span,
		requiredMinutes: required ?? requiredMinutes(span, breakMinutes ?? 0),
		night: isNight(s, e)
	};
}

/** 720 → `{ hours: 12, minutes: 0 }`, for "12 h" / "7 h 30 min". */
export function splitDuration(total: number): { hours: number; minutes: number } {
	return { hours: Math.floor(total / 60), minutes: total % 60 };
}
