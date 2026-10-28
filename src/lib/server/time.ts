import {
	fromDate,
	parseDate,
	parseDateTime,
	today,
	type CalendarDate
} from '@internationalized/date';
import { toAsciiDigits } from '#lib/schemas/auth.schema.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/datetime.js';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Damascus wall-clock fields as an instant, or `null` when they name no real moment
 * (`parseDateTime` throws `RangeError` on Feb 30, month 13, hour 25…).
 */
function damascusWallClock(
	y: string,
	m: string,
	d: string,
	h: string,
	min: string,
	s: string | undefined
): Date | null {
	try {
		return parseDateTime(
			`${y}-${pad(Number(m))}-${pad(Number(d))}T${pad(Number(h))}:${min}:${s ?? '00'}`
		).toDate(AIRPORT_TIME_ZONE);
	} catch {
		return null;
	}
}

/** `YYYY-MM-DD` as a calendar date, or `null` when it isn't a real day. */
function calendarDay(value: string): CalendarDate | null {
	try {
		return parseDate(value);
	} catch {
		return null;
	}
}

/** Christian-era wall-clock fields in Damascus, as `YYYY-MM-DD`. */
export function damascusDayOf(date: Date): string {
	const zoned = fromDate(date, AIRPORT_TIME_ZONE);
	return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}`;
}

/**
 * Parse a wall-clock date-time as Damascus time. Accepts `YYYY-MM-DD HH:mm[:ss]`,
 * `DD/MM/YYYY HH:mm[:ss]`, or an explicit instant with `Z` / a UTC offset. Returns `null` for
 * anything else, including impossible dates, so callers can flag the value instead of crashing.
 */
export function parseDamascusDateTime(input: string): Date | null {
	const value = toAsciiDigits(input).trim();

	const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (iso) {
		const [, y, m, d, h, min, s] = iso;
		return damascusWallClock(y, m, d, h, min, s);
	}

	const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (dmy) {
		const [, d, m, y, h, min, s] = dmy;
		return damascusWallClock(y, m, d, h, min, s);
	}

	if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(value)) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	return null;
}

/**
 * The half-open UTC range of one Damascus calendar day, used for day filters (CLAUDE.md §6.4).
 * `value` is `YYYY-MM-DD`; omitted or not a real day means today in Damascus.
 */
export function damascusDayRange(value?: string | null): { day: string; start: Date; end: Date } {
	const day = (value ? calendarDay(value) : null) ?? today(AIRPORT_TIME_ZONE);
	return {
		day: day.toString(),
		start: day.toDate(AIRPORT_TIME_ZONE),
		end: day.add({ days: 1 }).toDate(AIRPORT_TIME_ZONE)
	};
}

/** Today's `YYYY-MM-DD` in Damascus. */
export function todayInDamascus(): string {
	return today(AIRPORT_TIME_ZONE).toString();
}
