import { DateFormatter } from '@internationalized/date';
import { startOfDamascusDay } from '#lib/roster/cycle.js';
import type { RosterShift } from '#lib/roster/shift.js';
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/datetime.js';
import { lookupName } from '#lib/utils/locale.js';

type LabelledShift = Pick<RosterShift, 'code' | 'nameEn' | 'nameAr'>;

/** Shifts by id, for resolving pattern slots. */
export function shiftsById<T extends Pick<RosterShift, 'id'>>(
	shifts: readonly T[]
): Map<string, T> {
	return new Map(shifts.map((s) => [s.id, s]));
}

/** `Day (D)`, or `Off`. */
export function slotLabel(shift: LabelledShift | null): string {
	return shift ? `${lookupName(shift)} (${shift.code})` : m.roster_kind_off();
}

/** The shift's code, or the off letter (`O`). */
export function slotCode(shift: Pick<RosterShift, 'code'> | null): string {
	return shift?.code ?? m.roster_letter_off();
}

/** A pattern's slots as codes, e.g. `D D N N O O O O`. Show inside `<bdi dir="ltr">`. */
export function slotCodes(
	slots: readonly (string | null)[],
	shifts: ReadonlyMap<string, Pick<RosterShift, 'code'>>
): string {
	return slots
		.map((id) => (id === null ? slotCode(null) : (shifts.get(id)?.code ?? '?')))
		.join(' ');
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

/** Weekday names in the current locale, Sunday first (0 = Sunday … 6 = Saturday). */
export function weekdayNames(style: 'short' | 'long' = 'short'): string[] {
	const format = new DateFormatter(getLocale(), { weekday: style, timeZone: 'UTC' });
	// 2026-01-04 is a Sunday.
	return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2026, 0, 4 + i))));
}
