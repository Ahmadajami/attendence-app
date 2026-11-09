// One-time punch history from a filled sheet (plan 2026-11-09-operations-october-punch-import,
// OI13–OI17): one row per person and date with `HH:mm` check-in / check-out. Pure: the script loads
// people, stored days, shifts and events; this decides what to insert. A row reads like the manual
// entry sheet (`resolvePair`, `validatePair`); its shift is the planned one, or `attributeEvent`'s
// best fit on the row's date when the times don't fit the planned shift's window.
import { parseDate, parseTime, toCalendarDateTime } from '@internationalized/date';
import { attributeEvent, type AttendanceEntry } from '#lib/roster/attendance.js';
import type { SheetCell } from '#lib/roster/fit-roster.js';
import type { RosterDay } from '#lib/roster/roster.js';
import { attributionWindow, type RosterShift } from '#lib/roster/shift.js';
import type { PunchSource, RosterSource, SwapRole } from '#lib/schemas/enums.js';
import { AIRPORT_TIME_ZONE } from '#lib/utils/timezone.js';
import {
	normalizeClock,
	pairsOf,
	resolveCheckIn,
	resolveCheckOut,
	toPairs,
	validatePair,
	type Pair,
	type PairIssue
} from './entry.js';

/** The sheet's column headers (the template's `Punches` sheet); other columns are ignored. */
export const PUNCH_SHEET_HEADERS = {
	employeeNo: 'Employee No',
	date: 'Date',
	checkIn: 'Check in',
	checkOut: 'Check out'
} as const;

/** Two punches of one person and type closer than this are one (OI7). */
export const DUPLICATE_SECONDS = 60;

/** One filled row: `line` is the 1-based sheet row; times are `HH:mm` or `null`. */
export type PunchRow = {
	line: number;
	employeeNo: string;
	date: string;
	checkIn: string | null;
	checkOut: string | null;
};

export type RowIssue = { line: number; issue: 'no_employee' | 'bad_date' | 'bad_time' };

export class MissingHeaderError extends Error {
	constructor(readonly header: string) {
		super(`The sheet has no "${header}" column.`);
	}
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** A date cell: an Excel date (UTC midnight) or `YYYY-MM-DD` text. */
function dateOf(cell: SheetCell): string | null {
	if (cell instanceof Date)
		return Number.isNaN(cell.getTime()) ? null : cell.toISOString().slice(0, 10);
	const text = String(cell ?? '').trim();
	return DATE.test(text) ? text : null;
}

/**
 * A time cell → `HH:mm`; `''` when empty, `null` when unreadable. Text goes through the entry
 * sheet's shorthand (`730` → `07:30`); an Excel time is a date on 1899-12-30 (UTC) or a day fraction.
 */
function clockOf(cell: SheetCell): string | null {
	if (cell === null || cell === undefined || cell === '') return '';
	if (cell instanceof Date) return `${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}`;
	if (typeof cell === 'number') {
		if (cell < 0 || cell >= 1) return null;
		const minutes = Math.round(cell * 1440) % 1440;
		return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
	}
	const clock = normalizeClock(String(cell));
	return clock === '' ? '' : CLOCK.test(clock) ? clock : null;
}

/**
 * Sheet rows (header first) → filled rows. A row without any time is `empty` (no punch that day,
 * never guessed); one with an unreadable employee number, date or time is an issue.
 */
export function readPunchSheet(sheet: readonly (readonly SheetCell[])[]): {
	rows: PunchRow[];
	issues: RowIssue[];
	empty: number;
} {
	const header = (sheet[0] ?? []).map((cell) => String(cell ?? '').trim());
	const column = (name: string) => {
		const index = header.indexOf(name);
		if (index < 0) throw new MissingHeaderError(name);
		return index;
	};
	const at = {
		employeeNo: column(PUNCH_SHEET_HEADERS.employeeNo),
		date: column(PUNCH_SHEET_HEADERS.date),
		checkIn: column(PUNCH_SHEET_HEADERS.checkIn),
		checkOut: column(PUNCH_SHEET_HEADERS.checkOut)
	};

	const rows: PunchRow[] = [];
	const issues: RowIssue[] = [];
	let empty = 0;
	sheet.slice(1).forEach((cells, index) => {
		const line = index + 2;
		const checkIn = clockOf(cells[at.checkIn]);
		const checkOut = clockOf(cells[at.checkOut]);
		if (checkIn === '' && checkOut === '') {
			empty++;
			return;
		}
		const employeeNo = String(cells[at.employeeNo] ?? '').trim();
		const date = dateOf(cells[at.date]);
		if (employeeNo === '') issues.push({ line, issue: 'no_employee' });
		else if (date === null) issues.push({ line, issue: 'bad_date' });
		else if (checkIn === null || checkOut === null) issues.push({ line, issue: 'bad_time' });
		else
			rows.push({ line, employeeNo, date, checkIn: checkIn || null, checkOut: checkOut || null });
	});
	return { rows, issues, empty };
}

/** A person's stored day (OI6): its planned shift (`null` when off) and team on that date. */
export type ScopeDay = {
	staffId: string;
	date: string;
	teamId: string | null;
	shift: RosterShift | null;
	source: RosterSource;
	swapRole: SwapRole | null;
};

export type ExistingEvent = Pick<
	AttendanceEntry,
	'id' | 'type' | 'occurredAt' | 'correctsEventId' | 'isVoid'
> & { staffId: string; source: PunchSource };

export type ImportInput = {
	rows: readonly PunchRow[];
	/** Employee number → staff id, for the people in scope only. */
	people: ReadonlyMap<string, string>;
	/** `${staffId} ${date}` → stored day. */
	days: ReadonlyMap<string, ScopeDay>;
	/** Active shifts; on a tie the first wins, so list the roster's own shifts first. */
	shifts: readonly RosterShift[];
	/** The people's stored events around the range (every source, corrections too). */
	existing: readonly ExistingEvent[];
	from: string;
	to: string;
	now: Date;
	/** Stored on a pair outside its planned shift (OI5). */
	reason: string;
	source: PunchSource;
	timeZone?: string;
};

export type ImportRejection =
	| 'not_in_scope'
	| 'out_of_range'
	| 'no_roster_day'
	| 'check_out_only'
	| 'no_shift_fits'
	| 'span_too_long'
	| 'overlap'
	| 'future';

export type ImportEvent = {
	staffId: string;
	type: 'check_in' | 'check_out';
	occurredAt: Date;
	shiftDate: string;
	shiftId: string;
	teamId: string | null;
	reason: string | null;
};

export type ImportPair = {
	line: number;
	staffId: string;
	shiftDate: string;
	shiftId: string;
	/** On the shift the roster plans that day. */
	planned: boolean;
	warnings: PairIssue[];
	/** Events still to insert (an end already stored by an earlier run is left out). */
	events: ImportEvent[];
};

export type ImportPlan = {
	pairs: ImportPair[];
	rejected: { line: number; reason: ImportRejection }[];
	/** Rows whose punches an earlier run already stored. */
	alreadyImported: number;
	/** Rows within `DUPLICATE_SECONDS` of another punch of the person (in the file or stored). */
	duplicates: number;
};

function wallClock(date: string, time: string, timeZone: string): Date {
	return toCalendarDateTime(parseDate(date), parseTime(time)).toDate(timeZone);
}

/** The row's instants on a shift, as the entry sheet reads typed times. */
function resolveRow(
	row: PunchRow & { checkIn: string },
	shift: RosterShift,
	timeZone: string
): Pair {
	const checkIn = resolveCheckIn(row.date, shift, row.checkIn, timeZone);
	return {
		checkIn,
		checkOut: row.checkOut ? resolveCheckOut(checkIn, row.checkOut, timeZone) : null
	};
}

function fits(pair: Pair, date: string, shift: RosterShift, timeZone: string): boolean {
	const { start, end } = attributionWindow(date, shift, timeZone);
	const inside = (at: Date) => at >= start && at <= end;
	return inside(pair.checkIn) && (pair.checkOut === null || inside(pair.checkOut));
}

/** An off day on `date` for `attributeEvent`, so only unscheduled shifts on that date compete. */
function offDay(day: ScopeDay): RosterDay {
	return {
		date: day.date,
		teamId: day.teamId,
		shiftId: null,
		shift: null,
		start: null,
		end: null,
		source: day.source,
		plannedShiftId: null,
		assignmentId: null,
		patternId: null,
		adjustment: null,
		extra: false,
		swapGroupId: null,
		swapRole: day.swapRole,
		absenceType: null,
		holiday: null
	};
}

/**
 * The shift a row is counted for, on the row's date: the planned shift when both times sit in its
 * attribution window; else the shift whose window holds the check-in best (`attributeEvent`) if both
 * times fit it; else the planned shift anyway (`validatePair` then warns `outside_window`).
 */
function chooseShift(
	row: PunchRow & { checkIn: string },
	day: ScopeDay,
	shifts: readonly RosterShift[],
	timeZone: string
): { shift: RosterShift; planned: boolean } | null {
	const planned = day.shift;
	if (planned && fits(resolveRow(row, planned, timeZone), row.date, planned, timeZone))
		return { shift: planned, planned: true };
	const others = shifts.filter((s) => s.id !== planned?.id);
	const hit = attributeEvent(
		wallClock(row.date, row.checkIn, timeZone),
		'check_in',
		[offDay(day)],
		others
	);
	const best = hit ? others.find((s) => s.id === hit.shiftId) : undefined;
	if (best && (!planned || fits(resolveRow(row, best, timeZone), row.date, best, timeZone)))
		return { shift: best, planned: false };
	return planned ? { shift: planned, planned: true } : null;
}

const key = (staffId: string, type: string, at: Date) => `${staffId} ${type} ${at.getTime()}`;

/**
 * What to insert. Per row, in order: scope and range; already stored by an earlier run (same
 * person, type, instant and source); a duplicate of another punch within 60 s; the shift; the
 * entry sheet's checks (errors reject, warnings keep the pair with `reason`).
 */
export function planPunchImport(input: ImportInput): ImportPlan {
	const timeZone = input.timeZone ?? AIRPORT_TIME_ZONE;
	const plan: ImportPlan = { pairs: [], rejected: [], alreadyImported: 0, duplicates: 0 };
	const reject = (line: number, reason: ImportRejection) => plan.rejected.push({ line, reason });

	const stored = new Set(
		input.existing
			.filter(
				(e) =>
					e.source === input.source &&
					!e.isVoid &&
					e.type !== 'break_start' &&
					e.type !== 'break_end'
			)
			.map((e) => key(e.staffId, e.type, e.occurredAt))
	);
	const eventsOf = new Map<string, ExistingEvent[]>();
	for (const e of input.existing) eventsOf.set(e.staffId, [...(eventsOf.get(e.staffId) ?? []), e]);
	/** Punches seen so far per person (stored, then accepted), for the 60 s rule. */
	const seen = new Map<string, { type: string; at: number }[]>();
	for (const e of input.existing)
		if (!e.isVoid)
			seen.set(e.staffId, [
				...(seen.get(e.staffId) ?? []),
				{ type: e.type, at: e.occurredAt.getTime() }
			]);
	const accepted = new Map<string, Pair[]>();

	for (const row of input.rows) {
		const staffId = input.people.get(row.employeeNo);
		if (!staffId) {
			reject(row.line, 'not_in_scope');
			continue;
		}
		if (row.date < input.from || row.date > input.to) {
			reject(row.line, 'out_of_range');
			continue;
		}
		const day = input.days.get(`${staffId} ${row.date}`);
		if (!day) {
			reject(row.line, 'no_roster_day');
			continue;
		}
		if (row.checkIn === null) {
			reject(row.line, 'check_out_only');
			continue;
		}
		const withIn = { ...row, checkIn: row.checkIn };
		const choice = chooseShift(withIn, day, input.shifts, timeZone);
		if (!choice) {
			reject(row.line, 'no_shift_fits');
			continue;
		}
		const pair = resolveRow(withIn, choice.shift, timeZone);
		const ends = [
			{ type: 'check_in' as const, at: pair.checkIn },
			...(pair.checkOut ? [{ type: 'check_out' as const, at: pair.checkOut }] : [])
		];

		const isStored = ends.map((end) => stored.has(key(staffId, end.type, end.at)));
		if (isStored.every(Boolean)) {
			plan.alreadyImported++;
			continue;
		}
		const near = (end: (typeof ends)[number]) =>
			(seen.get(staffId) ?? []).some(
				(p) => p.type === end.type && Math.abs(p.at - end.at.getTime()) < DUPLICATE_SECONDS * 1000
			);
		if (ends.some((end, i) => !isStored[i] && near(end))) {
			plan.duplicates++;
			continue;
		}

		// Overlap is checked against the person's other pairs: not the one an earlier run stored half of.
		const mine = new Set(ends.map((end) => end.at.getTime()));
		const others = [
			...toPairs(pairsOf(eventsOf.get(staffId) ?? [])).filter(
				(p) => !mine.has(p.checkIn.getTime()) && !(p.checkOut && mine.has(p.checkOut.getTime()))
			),
			...(accepted.get(staffId) ?? [])
		];
		const { errors, warnings } = validatePair(pair, {
			shiftDate: row.date,
			shift: choice.shift,
			planned: choice.planned,
			others,
			now: input.now,
			timeZone
		});
		if (errors.length > 0) {
			reject(row.line, errors[0] as ImportRejection);
			continue;
		}

		const reason = warnings.length > 0 ? input.reason : null;
		plan.pairs.push({
			line: row.line,
			staffId,
			shiftDate: row.date,
			shiftId: choice.shift.id,
			planned: choice.planned,
			warnings,
			events: ends
				.filter((_, i) => !isStored[i])
				.map((end) => ({
					staffId,
					type: end.type,
					occurredAt: end.at,
					shiftDate: row.date,
					shiftId: choice.shift.id,
					teamId: day.teamId,
					reason
				}))
		});
		accepted.set(staffId, [...(accepted.get(staffId) ?? []), pair]);
		for (const end of ends)
			seen.set(staffId, [...(seen.get(staffId) ?? []), { type: end.type, at: end.at.getTime() }]);
	}
	return plan;
}
