import { DateFormatter } from '@internationalized/date';
import { startOfDamascusDay } from '#lib/roster/cycle.js';
import type { ShiftKind } from '#lib/schemas/enums.js';
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/datetime.js';

export function shiftKindLabel(kind: ShiftKind): string {
	if (kind === 'day') return m.roster_kind_day();
	if (kind === 'night') return m.roster_kind_night();
	return m.roster_kind_off();
}

/** One letter per cycle day: D / N / O in English. */
export function shiftKindLetter(kind: ShiftKind): string {
	if (kind === 'day') return m.roster_letter_day();
	if (kind === 'night') return m.roster_letter_night();
	return m.roster_letter_off();
}

/** `Mon 2`: a preview column header. */
export function formatPreviewDay(date: string): { weekday: string; day: string } {
	const at = startOfDamascusDay(date);
	return {
		weekday: new DateFormatter(getLocale(), {
			weekday: 'short',
			timeZone: AIRPORT_TIME_ZONE
		}).format(at),
		day: new DateFormatter(getLocale(), { day: 'numeric', timeZone: AIRPORT_TIME_ZONE }).format(at)
	};
}

/** `2 Nov 2026`, a calendar date (not an instant). Wrap in `<bdi>`. */
export function formatCalendarDate(date: string): string {
	return new DateFormatter(getLocale(), {
		dateStyle: 'medium',
		timeZone: AIRPORT_TIME_ZONE
	}).format(startOfDamascusDay(date));
}

/** `07:00` from a stored `07:00:00`. */
export function formatWallClock(time: string): string {
	return time.slice(0, 5);
}
