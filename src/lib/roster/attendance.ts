import type { AttendanceEventType } from '#lib/schemas/enums.js';
import type { AttendanceEvent, OvertimeApproval } from '#lib/server/db/schema/index.js';
import { shiftWindow, type WorkKind } from './cycle.js';
import { approvalState, computeOvertime, type ApprovalState, type Overtime } from './overtime.js';
import type { RosterDay } from './roster.js';
import {
	ATTRIBUTION_AFTER_MINUTES,
	ATTRIBUTION_BEFORE_MINUTES,
	LATE_GRACE_MINUTES,
	SHIFT_MINUTES
} from './rules.js';

const MINUTE = 60_000;

export type AttendanceEntry = Pick<
	AttendanceEvent,
	'id' | 'type' | 'occurredAt' | 'correctsEventId' | 'shiftKind'
>;

/** The shift an event is counted for. `scheduled` is false on a day the person wasn't rostered. */
export type Attribution = { shiftDate: string; shiftKind: WorkKind; scheduled: boolean };

type Candidate = Attribution & { start: Date; end: Date };

function inWindow(at: Date, c: Candidate): boolean {
	const t = at.getTime();
	return (
		t >= c.start.getTime() - ATTRIBUTION_BEFORE_MINUTES * MINUTE &&
		t <= c.end.getTime() + ATTRIBUTION_AFTER_MINUTES * MINUTE
	);
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
	const [{ shiftDate, shiftKind, scheduled }] = fits.sort(
		(a, b) => distance(at, type, a) - distance(at, type, b)
	);
	return { shiftDate, shiftKind, scheduled };
}

/**
 * The shift an event belongs to: one it falls in from 2 h before the start to 7 h after the end.
 * `days` are the person's roster days around the event (the day before, the day, the day after).
 * Rostered shifts win; otherwise the event is unscheduled and counted for the airport Day or Night
 * shift it fits. A check-out or break stays with the shift of the open check-in (`open`) while it
 * is in that shift's window. `null` when no shift times are known.
 */
export function attributeEvent(
	at: Date,
	type: AttendanceEventType,
	days: readonly RosterDay[],
	open: Attribution | null = null
): Attribution | null {
	const kinds: WorkKind[] = ['day', 'night'];
	const all: Candidate[] = days.flatMap(({ date, kind: rostered, start, times }) =>
		times
			? kinds.map((kind) => ({
					shiftDate: date,
					shiftKind: kind,
					scheduled: rostered === kind && start !== null,
					...shiftWindow(date, kind, times)
				}))
			: []
	);

	if (open && type !== 'check_in') {
		const same = all.filter(
			(c) => c.shiftDate === open.shiftDate && c.shiftKind === open.shiftKind
		);
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

/** Events in time order with every corrected event replaced by its correction. */
export function effectiveEvents<T extends AttendanceEntry>(events: readonly T[]): T[] {
	const corrected = new Set(events.flatMap((e) => (e.correctsEventId ? [e.correctsEventId] : [])));
	return events
		.filter((e) => !corrected.has(e.id))
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
	/** The shift worked or rostered (overtime category); `null` on an off day with no events. */
	kind: WorkKind | null;
	checkIn: Date | null;
	checkOut: Date | null;
	/** Minutes after the shift start of the first check-in (0 when on time or unscheduled). */
	lateMinutes: number;
	/** Check-in → check-out, breaks included (they are paid); `null` until checked out. */
	workedMinutes: number | null;
	/** Under 12 h on a rostered shift. */
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
	approval: Pick<OvertimeApproval, 'minutes'> | null = null
): ShiftSummary {
	const effective = effectiveEvents(events);
	const scheduled = day.kind !== 'off' && day.start !== null;
	// Events are never stored on `off` (a CHECK), but the column type allows it.
	const eventKind = effective[0]?.shiftKind;
	const kind: WorkKind | null =
		day.kind !== 'off' ? day.kind : eventKind && eventKind !== 'off' ? eventKind : null;

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
		else if (day.start && now.getTime() > day.start.getTime() + LATE_GRACE_MINUTES * MINUTE)
			status = 'missing';
		else status = 'expected';
	} else if (!scheduled) status = 'unscheduled';
	else if (closed) status = 'done';
	else if (onBreak) status = 'on_break';
	else status = lateMinutes > LATE_GRACE_MINUTES ? 'late' : 'present';

	const allOvertime = day.extra || !scheduled;
	const overtime =
		workedMinutes !== null && kind !== null ? computeOvertime(workedMinutes, allOvertime) : null;

	return {
		status,
		kind,
		checkIn,
		checkOut: closed ? checkOut : null,
		lateMinutes,
		workedMinutes,
		short: scheduled && !day.extra && workedMinutes !== null && workedMinutes < SHIFT_MINUTES,
		overtime,
		approval: approvalState(overtime?.minutes ?? 0, approval)
	};
}
