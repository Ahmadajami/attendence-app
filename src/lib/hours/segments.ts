import type { AttendanceEventType } from '#lib/schemas/enums.js';
import { addDays, zonedInstant } from './dates.js';

// Punches → worked segments, and their night minutes (plan 2026-11-16, WH9). Pure.

const MINUTE = 60_000;

/** The longest segment counted; a longer one is a problem (WH9, as the punch import). */
export const MAX_SEGMENT_MINUTES = 16 * 60;

/** The engine's view of an `attendance_event` row. */
export type HoursEvent = {
	id: string;
	type: AttendanceEventType;
	occurredAt: Date;
	/** The date the punch was entered for (plan PS1): the segment's date. */
	shiftDate: string;
	correctsEventId: string | null;
	isVoid: boolean;
};

export type Segment = {
	date: string;
	start: Date;
	end: Date;
	minutes: number;
	checkInId: string;
	checkOutId: string;
};

export type ProblemKind = 'missing_check_out' | 'missing_check_in' | 'too_long';
export type Problem = { date: string; kind: ProblemKind; eventId: string };

/**
 * The events that count: an event a later one corrects is replaced, and a void correction removes
 * the event it corrects (the same rule as `effectiveEvents` in `#lib/roster/attendance.ts`).
 * Sorted by time.
 */
export function countedEvents<E extends HoursEvent>(events: readonly E[]): E[] {
	const corrected = new Set(events.flatMap((e) => (e.correctsEventId ? [e.correctsEventId] : [])));
	return events
		.filter((e) => !corrected.has(e.id) && !e.isVoid)
		.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/**
 * Pair one person's punches into segments, date by date (WH9): in time order a check-in opens a
 * segment and the next check-out closes it; breaks are paid, so break events change nothing. A
 * check-in left open, a check-out with nothing open and a segment over 16 h are problems and count
 * nothing.
 */
export function pairSegments(events: readonly HoursEvent[]): {
	segments: Segment[];
	problems: Problem[];
} {
	const byDate = new Map<string, HoursEvent[]>();
	for (const e of countedEvents(events)) {
		const list = byDate.get(e.shiftDate) ?? [];
		list.push(e);
		byDate.set(e.shiftDate, list);
	}
	const segments: Segment[] = [];
	const problems: Problem[] = [];
	for (const date of [...byDate.keys()].sort()) {
		let open: HoursEvent | null = null;
		for (const e of byDate.get(date) ?? []) {
			if (e.type === 'check_in') {
				if (open) problems.push({ date, kind: 'missing_check_out', eventId: open.id });
				open = e;
			} else if (e.type === 'check_out') {
				if (!open) {
					problems.push({ date, kind: 'missing_check_in', eventId: e.id });
					continue;
				}
				const minutes = Math.floor((e.occurredAt.getTime() - open.occurredAt.getTime()) / MINUTE);
				if (minutes > MAX_SEGMENT_MINUTES)
					problems.push({ date, kind: 'too_long', eventId: open.id });
				else
					segments.push({
						date,
						start: open.occurredAt,
						end: e.occurredAt,
						minutes,
						checkInId: open.id,
						checkOutId: e.id
					});
				open = null;
			}
		}
		if (open) problems.push({ date, kind: 'missing_check_out', eventId: open.id });
	}
	return { segments, problems };
}

export type NightWindow = { start: string; end: string; timeZone: string };

/**
 * Whole minutes of `[start, end)` inside the night window, at most the interval's whole minutes.
 * `date` is the segment's date: windows from the day before to two days after are checked, enough
 * for a segment of at most 16 h entered on its night's date.
 */
export function nightMinutes(start: Date, end: Date, date: string, night: NightWindow): number {
	const total = Math.floor((end.getTime() - start.getTime()) / MINUTE);
	if (night.start === night.end || total <= 0) return 0;
	const crosses = night.end < night.start;
	let overlap = 0;
	for (let i = -1; i <= 2; i++) {
		const d = addDays(date, i);
		const ws = zonedInstant(d, night.start, night.timeZone).getTime();
		const we = zonedInstant(crosses ? addDays(d, 1) : d, night.end, night.timeZone).getTime();
		overlap += Math.max(0, Math.min(end.getTime(), we) - Math.max(start.getTime(), ws));
	}
	return Math.min(total, Math.floor(overlap / MINUTE));
}
