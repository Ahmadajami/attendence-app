// Manual punch entry: typed `HH:mm` → instants, checks, and pairs. Pure: no DB, no SvelteKit, so
// the entry sheet runs the same checks in the browser as the service does on save.
import {
	fromDate,
	parseDate,
	parseTime,
	toCalendarDate,
	toCalendarDateTime
} from '@internationalized/date';
import { formatClock, parseClock } from '#lib/payroll/schedule.js';
import { effectiveEvents, type AttendanceEntry } from '#lib/roster/attendance.js';
import { addDays } from '#lib/roster/cycle.js';
import { attributionWindow, endsNextDay, type RosterShift } from '#lib/roster/shift.js';
import { toAsciiDigits } from '#lib/schemas/auth.schema.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/datetime.js';

/** A check-in and its check-out; `null` while the check-out is missing (never invented). */
export type Pair = { checkIn: Date; checkOut: Date | null };

/** What resolving and checking a typed pair needs from the roster's planned shift (plan PS2). */
export type EntryShift = Pick<
	RosterShift,
	'startTime' | 'endTime' | 'windowBeforeMinutes' | 'windowAfterMinutes'
>;

/** A pair may not be longer than this. */
export const MAX_PAIR_MINUTES = 16 * 60;

const MINUTE = 60_000;

function wallClock(date: string, time: string, timeZone: string): Date {
	return toCalendarDateTime(parseDate(date), parseTime(time)).toDate(timeZone);
}

/** The calendar date of an instant in `timeZone`, as `YYYY-MM-DD`. */
export function calendarDate(at: Date, timeZone: string = AIRPORT_TIME_ZONE): string {
	return toCalendarDate(fromDate(at, timeZone)).toString();
}

/**
 * Typed shorthand → `HH:mm`: `7` → `07:00`, `730` → `07:30`, `1900` → `19:00`, `19.30` →
 * `19:30`; Arabic-Indic digits too. Anything else comes back unchanged (validation reports it).
 */
export function normalizeClock(value: string): string {
	const v = toAsciiDigits(value.trim()).replace(/[.,]/, ':');
	if (v === '') return '';
	const match = /^(\d{1,2}):(\d{2})$/.exec(v) ?? /^(\d{1,2})(\d{2})$/.exec(v);
	const [h, mm] = match ? [match[1], match[2]] : /^\d{1,2}$/.test(v) ? [v, '00'] : [null, null];
	if (h === null || Number(h) > 23 || Number(mm) > 59) return value;
	return `${h.padStart(2, '0')}:${mm}`;
}

/** The wall-clock `HH:mm` of an instant in `timeZone`. Show inside `<bdi>`. */
export function clockOf(at: Date, timeZone: string = AIRPORT_TIME_ZONE): string {
	const zoned = fromDate(at, timeZone);
	return formatClock(zoned.hour * 60 + zoned.minute);
}

/**
 * A typed check-in on a shift date: that wall-clock time on the shift date. Only when the roster
 * plans a shift that ends the next day is a time before that shift's window opens
 * (`start − window_before`) the next morning (02:00 typed on a 19:00 night is 02:00 the day after).
 * `shift` is the roster's planned shift, `null` on a day off (punches carry no shift, plan PS1).
 */
export function resolveCheckIn(
	shiftDate: string,
	shift: EntryShift | null,
	time: string,
	timeZone: string = AIRPORT_TIME_ZONE
): Date {
	const opens = shift ? parseClock(shift.startTime) - shift.windowBeforeMinutes : 0;
	const nextDay = shift !== null && endsNextDay(shift) && parseClock(time) < opens;
	return wallClock(nextDay ? addDays(shiftDate, 1) : shiftDate, time, timeZone);
}

/** A typed check-out: the first instant at that wall-clock time after the check-in. */
export function resolveCheckOut(
	checkIn: Date,
	time: string,
	timeZone: string = AIRPORT_TIME_ZONE
): Date {
	const day = calendarDate(checkIn, timeZone);
	const sameDay = wallClock(day, time, timeZone);
	return sameDay > checkIn ? sameDay : wallClock(addDays(day, 1), time, timeZone);
}

/**
 * Typed `HH:mm` check-in and check-out → instants. A check-out earlier than (or equal to) the
 * check-in is the next day. A missing check-out stays missing.
 */
export function resolvePair(
	shiftDate: string,
	shift: EntryShift | null,
	checkIn: string,
	checkOut: string | null,
	timeZone: string = AIRPORT_TIME_ZONE
): Pair {
	const at = resolveCheckIn(shiftDate, shift, checkIn, timeZone);
	return { checkIn: at, checkOut: checkOut ? resolveCheckOut(at, checkOut, timeZone) : null };
}

/** Whole minutes from check-in to check-out; `null` while open. */
export function pairMinutes(pair: Pair): number | null {
	return pair.checkOut
		? Math.floor((pair.checkOut.getTime() - pair.checkIn.getTime()) / MINUTE)
		: null;
}

/** An open pair counts as its check-in instant. Touching pairs (out = next in) don't overlap. */
function overlaps(a: Pair, b: Pair): boolean {
	const end = (p: Pair) => (p.checkOut ?? new Date(p.checkIn.getTime() + 1)).getTime();
	return a.checkIn.getTime() < end(b) && b.checkIn.getTime() < end(a);
}

export type PairIssue = 'span_too_long' | 'overlap' | 'future' | 'outside_window' | 'unplanned';

export type PairContext = {
	shiftDate: string;
	/** The roster's planned shift that day; `null` on a day off. */
	shift: EntryShift | null;
	/** The person's other effective pairs, on any shift date. */
	others: readonly Pair[];
	now: Date;
	timeZone?: string;
};

/**
 * Errors refuse the pair: longer than 16 h, overlapping another pair, or in the future. Warnings
 * never refuse (plan PS4, PS5): times that don't fit the planned shift's attribution window, or a
 * punch on a day off (the roster plans no shift).
 */
export function validatePair(
	pair: Pair,
	ctx: PairContext
): { errors: PairIssue[]; warnings: PairIssue[] } {
	const errors: PairIssue[] = [];
	const warnings: PairIssue[] = [];

	const minutes = pairMinutes(pair);
	if (minutes !== null && minutes > MAX_PAIR_MINUTES) errors.push('span_too_long');
	if (ctx.others.some((other) => overlaps(pair, other))) errors.push('overlap');
	const now = ctx.now.getTime();
	if (pair.checkIn.getTime() > now || (pair.checkOut && pair.checkOut.getTime() > now))
		errors.push('future');

	if (ctx.shift) {
		const window = attributionWindow(ctx.shiftDate, ctx.shift, ctx.timeZone);
		const inside = (at: Date) => at >= window.start && at <= window.end;
		if (!inside(pair.checkIn) || (pair.checkOut && !inside(pair.checkOut)))
			warnings.push('outside_window');
	} else warnings.push('unplanned');

	return { errors, warnings };
}

/** A check-in and its check-out events; either side may be missing. */
export type EventPair<T> = { checkIn: T | null; checkOut: T | null };

/**
 * Effective events → check-in / check-out pairs, in time order. Breaks are skipped (two segments
 * on one shift date are the payroll engine's concern, R16). A check-in after an open one leaves the
 * first open; a check-out with no open check-in stands alone.
 */
export function pairsOf<
	T extends Pick<AttendanceEntry, 'id' | 'type' | 'occurredAt' | 'correctsEventId' | 'isVoid'>
>(events: readonly T[]): EventPair<T>[] {
	const pairs: EventPair<T>[] = [];
	let open: T | null = null;
	for (const event of effectiveEvents(events)) {
		if (event.type === 'check_in') {
			if (open) pairs.push({ checkIn: open, checkOut: null });
			open = event;
		} else if (event.type === 'check_out') {
			pairs.push({ checkIn: open, checkOut: event });
			open = null;
		}
	}
	if (open) pairs.push({ checkIn: open, checkOut: null });
	return pairs;
}

/** The instants of event pairs that have a check-in, for overlap checks. */
export function toPairs<T extends Pick<AttendanceEntry, 'occurredAt'>>(
	pairs: readonly EventPair<T>[]
): Pair[] {
	return pairs.flatMap((p) =>
		p.checkIn ? [{ checkIn: p.checkIn.occurredAt, checkOut: p.checkOut?.occurredAt ?? null }] : []
	);
}

/** Minutes worked over the closed pairs; `null` when nothing is closed yet. */
export function workedMinutes(pairs: readonly Pair[]): number | null {
	const closed = pairs.map(pairMinutes).filter((m): m is number => m !== null);
	return closed.length > 0 ? closed.reduce((a, b) => a + b, 0) : null;
}

/** Per person and shift date: minutes worked over closed pairs (`null` while still open). */
export type PunchDays = Record<string, Record<string, { worked: number | null }>>;

/** Summarise events (any people, any shift dates) for roster previews. */
export function punchDays<
	T extends Pick<AttendanceEntry, 'id' | 'type' | 'occurredAt' | 'correctsEventId' | 'isVoid'> & {
		staffId: string;
		shiftDate: string;
	}
>(events: readonly T[]): PunchDays {
	const groups = new Map<string, T[]>();
	for (const e of events) {
		const key = `${e.staffId} ${e.shiftDate}`;
		groups.set(key, [...(groups.get(key) ?? []), e]);
	}
	const out: PunchDays = {};
	for (const [key, group] of groups) {
		const pairs = pairsOf(group);
		if (pairs.length === 0) continue;
		const [staffId, date] = key.split(' ');
		(out[staffId] ??= {})[date] = { worked: workedMinutes(toPairs(pairs)) };
	}
	return out;
}
