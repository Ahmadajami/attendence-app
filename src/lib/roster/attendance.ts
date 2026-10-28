import type { AttendanceEventType } from '#lib/schemas/enums.js';
import type { AttendanceEvent } from '#lib/server/db/schema/index.js';
import {
	approvalState,
	computeOvertime,
	type ApprovalState,
	type ApprovedOvertime,
	type Overtime
} from './overtime.js';
import type { RosterDay } from './roster.js';
import {
	attributionWindow,
	graceOf,
	requiredOf,
	shiftWindow,
	type RosterShift,
	type TimeWindow
} from './shift.js';

const MINUTE = 60_000;

export type AttendanceEntry = Pick<
	AttendanceEvent,
	'id' | 'type' | 'occurredAt' | 'correctsEventId' | 'shiftId' | 'isVoid'
>;

/** The shift an event is counted for. `scheduled` is false on a day the person wasn't rostered. */
export type Attribution = { shiftDate: string; shiftId: string; scheduled: boolean };

type Candidate = Attribution & TimeWindow & { window: TimeWindow };

function inWindow(at: Date, c: Candidate): boolean {
	const t = at.getTime();
	return t >= c.window.start.getTime() && t <= c.window.end.getTime();
}

/** How well an event fits a shift: a check-in by its start, a check-out by its end, a break inside. */
function distance(at: Date, type: AttendanceEventType, c: Candidate): number {
	const t = at.getTime();
	if (type === 'check_in') return Math.abs(t - c.start.getTime());
	if (type === 'check_out') return Math.abs(t - c.end.getTime());
	return Math.max(0, c.start.getTime() - t, t - c.end.getTime());
}

function best(at: Date, type: AttendanceEventType, candidates: Candidate[]): Attribution | null {
	const fits = candidates.filter((c) => inWindow(at, c));
	if (fits.length === 0) return null;
	const [{ shiftDate, shiftId, scheduled }] = fits.sort(
		(a, b) => distance(at, type, a) - distance(at, type, b)
	);
	return { shiftDate, shiftId, scheduled };
}

function candidate(date: string, shift: RosterShift, scheduled: boolean): Candidate {
	return {
		shiftDate: date,
		shiftId: shift.id,
		scheduled,
		...shiftWindow(date, shift),
		window: attributionWindow(date, shift)
	};
}

/**
 * The shift an event belongs to: one whose attribution window (the shift's own minutes before its
 * start and after its end) holds it. `days` are the person's roster days around the event (the day
 * before, the day, the day after). Rostered shifts win; otherwise the event is unscheduled and
 * counted for the `candidates` shift (the active shifts) it fits best. A check-out or break stays
 * with the shift of the open check-in (`open`) while it is in that shift's window. `null` when no
 * shift fits.
 */
export function attributeEvent(
	at: Date,
	type: AttendanceEventType,
	days: readonly RosterDay[],
	candidates: readonly RosterShift[],
	open: Attribution | null = null
): Attribution | null {
	const all: Candidate[] = days.flatMap(({ date, shift: rostered, start }) => {
		const scheduled = rostered && start ? candidate(date, rostered, true) : null;
		const others = candidates
			.filter((s) => s.id !== scheduled?.shiftId)
			.map((s) => candidate(date, s, false));
		return scheduled ? [scheduled, ...others] : others;
	});

	if (open && type !== 'check_in') {
		const same = all.filter((c) => c.shiftDate === open.shiftDate && c.shiftId === open.shiftId);
		const kept = best(at, type, same);
		if (kept) return { ...kept, scheduled: open.scheduled };
	}

	return (
		best(
			at,
			type,
			all.filter((c) => c.scheduled)
		) ??
		best(
			at,
			type,
			all.filter((c) => !c.scheduled)
		)
	);
}

/**
 * Events in time order with every corrected event replaced by its correction; a void correction
 * removes the event it corrects.
 */
export function effectiveEvents<
	T extends Pick<AttendanceEntry, 'id' | 'occurredAt' | 'correctsEventId' | 'isVoid'>
>(events: readonly T[]): T[] {
	const corrected = new Set(events.flatMap((e) => (e.correctsEventId ? [e.correctsEventId] : [])));
	return events
		.filter((e) => !corrected.has(e.id) && !e.isVoid)
		.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

export type ShiftStatus =
	| 'expected'
	| 'present'
	| 'late'
	| 'on_break'
	| 'done'
	| 'missing'
	| 'absent'
	| 'off'
	| 'unscheduled';

export type ShiftSummary = {
	status: ShiftStatus;
	/** The shift worked or rostered; `null` on an off day with no events. */
	shiftId: string | null;
	checkIn: Date | null;
	checkOut: Date | null;
	/** Minutes after the shift start of the first check-in (0 when on time or unscheduled). */
	lateMinutes: number;
	/** Check-in → check-out, breaks included (they are paid); `null` until checked out. */
	workedMinutes: number | null;
	/** Under the shift's required minutes on a rostered shift. */
	short: boolean;
	overtime: Overtime | null;
	approval: ApprovalState;
};

/**
 * Status, worked time and overtime of one person's shift date, from the roster day and the events
 * counted for it (`now` decides expected vs missing).
 */
export function shiftSummary(
	day: RosterDay,
	events: readonly AttendanceEntry[],
	now: Date,
	approval: ApprovedOvertime | null = null
): ShiftSummary {
	const effective = effectiveEvents(events);
	const scheduled = day.shift !== null && day.start !== null;
	const shiftId = day.shiftId ?? effective[0]?.shiftId ?? null;
	const required = day.shift ? requiredOf(day.shift) : 0;
	const grace = day.shift ? graceOf(day.shift) : 0;

	let worked = 0;
	let openSince: Date | null = null;
	let checkIn: Date | null = null;
	let checkOut: Date | null = null;
	let onBreak = false;
	for (const e of effective) {
		if (e.type === 'check_in' && openSince === null) {
			openSince = e.occurredAt;
			checkIn ??= e.occurredAt;
			onBreak = false;
		} else if (e.type === 'check_out' && openSince !== null) {
			worked += Math.floor((e.occurredAt.getTime() - openSince.getTime()) / MINUTE);
			openSince = null;
			checkOut = e.occurredAt;
			onBreak = false;
		} else if (e.type === 'break_start' && openSince !== null) {
			onBreak = true;
		} else if (e.type === 'break_end') {
			onBreak = false;
		}
	}

	const closed = checkIn !== null && openSince === null;
	const workedMinutes = closed ? worked : null;
	const lateMinutes =
		scheduled && checkIn && day.start
			? Math.max(0, Math.floor((checkIn.getTime() - day.start.getTime()) / MINUTE))
			: 0;

	let status: ShiftStatus;
	if (checkIn === null) {
		if (!scheduled) status = day.source === 'absence' ? 'absent' : 'off';
		else if (day.start && now.getTime() > day.start.getTime() + grace * MINUTE) status = 'missing';
		else status = 'expected';
	} else if (!scheduled) status = 'unscheduled';
	else if (closed) status = 'done';
	else if (onBreak) status = 'on_break';
	else status = lateMinutes > grace ? 'late' : 'present';

	const allOvertime = day.extra || !scheduled;
	const overtime =
		workedMinutes !== null && shiftId !== null
			? computeOvertime(workedMinutes, required, allOvertime)
			: null;

	return {
		status,
		shiftId,
		checkIn,
		checkOut: closed ? checkOut : null,
		lateMinutes,
		workedMinutes,
		short: scheduled && !day.extra && workedMinutes !== null && workedMinutes < required,
		overtime,
		approval: approvalState(overtime?.minutes ?? 0, approval)
	};
}
