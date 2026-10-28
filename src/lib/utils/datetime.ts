import { DateFormatter, fromDate, parseDateTime } from '@internationalized/date';
import { getLocale } from '#lib/paraglide/runtime.js';

/** Airport time zone: every instant is shown in Damascus time, whatever the device's zone (CLAUDE.md §6.4). */
export const AIRPORT_TIME_ZONE = 'Asia/Damascus';

/** `26 Oct 2026, 13:17` in Damascus time, in the current locale. Wrap the result in `<bdi>`. */
export function formatDateTime(date: Date): string {
	return new DateFormatter(getLocale(), {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: AIRPORT_TIME_ZONE
	}).format(date);
}

/** `13:17` in Damascus time, in the current locale. Wrap the result in `<bdi>`. */
export function formatTime(date: Date): string {
	return new DateFormatter(getLocale(), {
		timeStyle: 'short',
		timeZone: AIRPORT_TIME_ZONE
	}).format(date);
}

/** `YYYY-MM-DDTHH:mm` in Damascus, for a `datetime-local` input. */
export function formatDamascusInput(date: Date): string {
	const zoned = fromDate(date, AIRPORT_TIME_ZONE);
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`;
}

/** A `datetime-local` value read as Damascus time; `null` when empty or not a real moment. */
export function parseDamascusInput(value: string): Date | null {
	if (!value) return null;
	try {
		return parseDateTime(value).toDate(AIRPORT_TIME_ZONE);
	} catch {
		return null;
	}
}
