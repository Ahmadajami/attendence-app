import type { AttendanceEventType, DayStatus, PunchSource } from '#lib/schemas/enums.js';
import {
	ATTENDANCE_RULE_DEFAULTS,
	fridayPrayerCredit,
	roundingOf,
	type AttendanceRules
} from './attendance-rules.js';
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

/** The engine's view of an `attendance_event` row. */
export type AttendanceEntry = {
	id: string;
	type: AttendanceEventType;
	occurredAt: Date;
	correctsEventId: string | null;
	isVoid: boolean;
	/** Typed (`manual`), a punch reading (`import`) or the Odoo seed (`seed`); absent in old callers. */
	source?: PunchSource;
};

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

/** Stored as `day_result.status` (`DAY_STATUSES`). */
export type ShiftStatus = DayStatus;

export type ShiftSummary = {
	status: ShiftStatus;
	/** The roster's shift that day (punches carry none, plan PS1); `null` on a day off. */
	shiftId: string | null;
	checkIn: Date | null;
	checkOut: Date | null;
	/** Minutes after the shift start of the first check-in (0 when on time or unscheduled). */
	lateMinutes: number;
	/** Check-in → check-out, breaks included (they are paid); `null` until checked out. */
	workedMinutes: number | null;
	/** Under the shift's required minutes on a rostered shift (after the credit). */
	short: boolean;
	/** Closed punch segments (check-in → check-out pairs) counted for the day. */
	segments: number;
	/** Friday Prayer credit (FP1): paid, counts toward the required time, never overtime. */
	creditMinutes: number;
	/** Required minutes not covered by worked time and credit (0 when none is short). */
	shortageMinutes: number;
	/** Credit left after covering the shortage: paid as extra time, not overtime. */
	creditExtraMinutes: number;
	overtime: Overtime | null;
	approval: ApprovalState;
	/** Where the counted check-in / check-out came from (pay plan PR24); `null` when unknown. */
	checkInSource: PunchSource | null;
	checkOutSource: PunchSource | null;
	/** A counted event is a correction of an earlier one. */
	corrected: boolean;
};

/**
 * Status, worked time and overtime of one person's shift date, from the roster day and the events
 * counted for it (`now` decides expected vs missing).
 */
export function shiftSummary(
	day: RosterDay,
	events: readonly AttendanceEntry[],
	now: Date,
	approval: ApprovedOvertime | null = null,
	rules: AttendanceRules = ATTENDANCE_RULE_DEFAULTS
): ShiftSummary {
	const effective = effectiveEvents(events);
	const scheduled = day.shift !== null && day.start !== null;
	const shiftId = day.shiftId;
	// A holiday requires nothing (R13); work on it is all overtime (PR3).
	const holiday = day.holiday !== null;
	const required = day.shift && !holiday ? requiredOf(day.shift) : 0;
	const grace = day.shift ? graceOf(day.shift) : 0;

	let worked = 0;
	let openSince: Date | null = null;
	let checkIn: Date | null = null;
	let checkOut: Date | null = null;
	let checkInSource: PunchSource | null = null;
	let checkOutSource: PunchSource | null = null;
	let onBreak = false;
	let segments = 0;
	for (const e of effective) {
		if (e.type === 'check_in' && openSince === null) {
			openSince = e.occurredAt;
			if (checkIn === null) {
				checkIn = e.occurredAt;
				checkInSource = e.source ?? null;
			}
			onBreak = false;
		} else if (e.type === 'check_out' && openSince !== null) {
			worked += Math.floor((e.occurredAt.getTime() - openSince.getTime()) / MINUTE);
			segments += 1;
			openSince = null;
			checkOut = e.occurredAt;
			checkOutSource = e.source ?? null;
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
	// A full-day state wins over punches (R7, PR19): they stay stored but count for nothing.
	if (day.source === 'absence') status = 'absent';
	else if (checkIn === null) {
		if (!scheduled) status = 'off';
		else if (day.start && now.getTime() > day.start.getTime() + grace * MINUTE) status = 'missing';
		else status = 'expected';
	} else if (!scheduled) status = 'unscheduled';
	else if (closed) status = 'done';
	else if (onBreak) status = 'on_break';
	else status = lateMinutes > grace ? 'late' : 'present';

	const allOvertime = day.extra || !scheduled || holiday;
	// Every closed day gets its overtime, a day off too: it no longer waits for a shift (PS3).
	const overtime =
		workedMinutes !== null
			? computeOvertime(workedMinutes, required, allOvertime, roundingOf(rules))
			: null;

	// The credit and the shortage apply to a planned work day only (FP1, Q-EN7): not a day off, a
	// holiday, an extra shift or a full-day state.
	const workDay = scheduled && !day.extra && !holiday && day.source !== 'absence';
	const creditMinutes =
		workDay && workedMinutes !== null
			? fridayPrayerCredit({ shiftDate: day.date, workDay, segments, rules })
			: 0;
	const shortfall = workDay && workedMinutes !== null ? Math.max(0, required - workedMinutes) : 0;
	const shortageMinutes = Math.max(0, shortfall - creditMinutes);
	const creditExtraMinutes = creditMinutes - Math.min(creditMinutes, shortfall);

	return {
		status,
		shiftId,
		checkIn,
		checkOut: closed ? checkOut : null,
		lateMinutes,
		workedMinutes,
		short: shortageMinutes > 0,
		segments,
		creditMinutes,
		shortageMinutes,
		creditExtraMinutes,
		overtime,
		approval: approvalState(overtime?.minutes ?? 0, approval),
		checkInSource,
		checkOutSource: closed ? checkOutSource : null,
		corrected: effective.some((e) => e.correctsEventId !== null)
	};
}
