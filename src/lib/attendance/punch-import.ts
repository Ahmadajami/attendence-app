// Punch history from a filled sheet or a Markdown table (plan 2026-11-11-punches-without-shifts):
// one row per person and date with `HH:mm` check-in / check-out. Pure: the script loads people,
// stored days and events; this decides what to insert. A row reads exactly like the manual entry
// sheet (`resolvePair`, `validatePair`) against the roster's planned shift. A punch carries no
// shift (PS1): a day off or times outside the planned shift are warnings, never a refusal.
import type { AttendanceEntry } from '#lib/roster/attendance.js';
import type { SheetCell } from '#lib/roster/fit-roster.js';
import type { RosterShift } from '#lib/roster/shift.js';
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

/** The Markdown table's column headers (the October attendance file); other columns are ignored. */
export const PUNCH_MARKDOWN_HEADERS = {
	employeeNo: 'ID',
	date: 'Date',
	checkIn: 'Check In',
	checkOut: 'Check Out'
} as const;

/**
 * A Markdown table (`| ID | Name | Date | … |`) → the same filled rows as `readPunchSheet`. Lines
 * that aren't table rows, the separator row and a `—` / `-` cell (no punch) are skipped or empty.
 * `line` is the 1-based line in the text.
 */
export function readPunchMarkdown(text: string): ReturnType<typeof readPunchSheet> {
	const lines = text.split(/\r?\n/);
	const cellsOf = (row: string) =>
		row
			.trim()
			.replace(/^\|/, '')
			.replace(/\|$/, '')
			.split('|')
			.map((cell) => cell.trim());
	const headerAt = lines.findIndex(
		(l) => l.trim().startsWith('|') && cellsOf(l).includes(PUNCH_MARKDOWN_HEADERS.employeeNo)
	);
	if (headerAt < 0) throw new MissingHeaderError(PUNCH_MARKDOWN_HEADERS.employeeNo);
	const header = cellsOf(lines[headerAt]);
	const pick = (name: string) => {
		const index = header.indexOf(name);
		if (index < 0) throw new MissingHeaderError(name);
		return index;
	};
	const at = {
		employeeNo: pick(PUNCH_MARKDOWN_HEADERS.employeeNo),
		date: pick(PUNCH_MARKDOWN_HEADERS.date),
		checkIn: pick(PUNCH_MARKDOWN_HEADERS.checkIn),
		checkOut: pick(PUNCH_MARKDOWN_HEADERS.checkOut)
	};
	const blank = (cell: string | undefined) => (cell === '—' || cell === '-' ? '' : (cell ?? ''));
	// Rebuild a sheet in the template's header order and reuse its reader, so both read alike.
	const sheet: SheetCell[][] = [
		[
			PUNCH_SHEET_HEADERS.employeeNo,
			PUNCH_SHEET_HEADERS.date,
			PUNCH_SHEET_HEADERS.checkIn,
			PUNCH_SHEET_HEADERS.checkOut
		]
	];
	const lineOf: number[] = [];
	lines.forEach((l, index) => {
		if (index <= headerAt || !l.trim().startsWith('|')) return;
		const cells = cellsOf(l);
		if (cells.every((c) => /^:?-{3,}:?$/.test(c))) return;
		sheet.push([
			cells[at.employeeNo] ?? '',
			cells[at.date] ?? '',
			blank(cells[at.checkIn]),
			blank(cells[at.checkOut])
		]);
		lineOf.push(index + 1);
	});
	const read = readPunchSheet(sheet);
	const realLine = (sheetLine: number) => lineOf[sheetLine - 2];
	return {
		rows: read.rows.map((r) => ({ ...r, line: realLine(r.line) })),
		issues: read.issues.map((i) => ({ ...i, line: realLine(i.line) })),
		empty: read.empty
	};
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
	/** The people's stored events around the range (every source, corrections too). */
	existing: readonly ExistingEvent[];
	from: string;
	to: string;
	now: Date;
	/** Note stored on a pair with a warning (a day off, outside the planned shift); `null`: none. */
	reason: string | null;
	source: PunchSource;
	timeZone?: string;
	/**
	 * A pair over 16 hours is kept with a `span_too_long` warning instead of refused: a file brings
	 * what the source recorded (Odoo paid these days, OC1); typed entry keeps refusing them.
	 */
	longSpanIsWarning?: boolean;
};

export type ImportRejection =
	| 'not_in_scope'
	| 'out_of_range'
	| 'no_roster_day'
	| 'check_out_only'
	| 'span_too_long'
	| 'overlap'
	| 'future';

export type ImportEvent = {
	staffId: string;
	type: 'check_in' | 'check_out';
	occurredAt: Date;
	shiftDate: string;
	teamId: string | null;
	reason: string | null;
};

export type ImportPair = {
	line: number;
	staffId: string;
	shiftDate: string;
	/** The roster's planned shift that day; `null` on a day off (day-off work). */
	plannedShiftId: string | null;
	warnings: PairIssue[];
	/** Events still to insert (an end already stored by an earlier run is left out). */
	events: ImportEvent[];
};

export type ImportSkip = 'already_imported' | 'duplicate';

export type ImportPlan = {
	pairs: ImportPair[];
	rejected: { line: number; reason: ImportRejection }[];
	/** Rows whose punches an earlier run already stored. */
	alreadyImported: number;
	/** Rows within `DUPLICATE_SECONDS` of another punch of the person (in the file or stored). */
	duplicates: number;
	/** The skipped rows by line (`alreadyImported` + `duplicates` of them). */
	skipped: { line: number; reason: ImportSkip }[];
};

/** Ids of events a void correction removed: they no longer count as stored or seen. */
function voidedIds(events: readonly ExistingEvent[]): Set<string> {
	return new Set(
		events.filter((e) => e.isVoid && e.correctsEventId).map((e) => e.correctsEventId as string)
	);
}

/** The row's instants, read like the entry sheet reads typed times on the planned shift. */
function resolveRow(
	row: PunchRow & { checkIn: string },
	shift: RosterShift | null,
	timeZone: string
): Pair {
	const checkIn = resolveCheckIn(row.date, shift, row.checkIn, timeZone);
	return {
		checkIn,
		checkOut: row.checkOut ? resolveCheckOut(checkIn, row.checkOut, timeZone) : null
	};
}

const key = (staffId: string, type: string, at: Date) => `${staffId} ${type} ${at.getTime()}`;

/**
 * What to insert. Per row, in order: scope and range; already stored by an earlier run (same
 * person, type, instant and source); a duplicate of another punch within 60 s; the entry sheet's
 * checks against the planned shift (errors reject, warnings keep the pair with `reason`).
 */
export function planPunchImport(input: ImportInput): ImportPlan {
	const timeZone = input.timeZone ?? AIRPORT_TIME_ZONE;
	const plan: ImportPlan = {
		pairs: [],
		rejected: [],
		alreadyImported: 0,
		duplicates: 0,
		skipped: []
	};
	const reject = (line: number, reason: ImportRejection) => plan.rejected.push({ line, reason });
	// An event an undo (or any void correction) removed is gone: a new import may bring it back.
	const voided = voidedIds(input.existing);
	const live = (e: ExistingEvent) => !e.isVoid && !voided.has(e.id);

	const stored = new Set(
		input.existing
			.filter(
				(e) =>
					e.source === input.source && live(e) && e.type !== 'break_start' && e.type !== 'break_end'
			)
			.map((e) => key(e.staffId, e.type, e.occurredAt))
	);
	const eventsOf = new Map<string, ExistingEvent[]>();
	for (const e of input.existing) eventsOf.set(e.staffId, [...(eventsOf.get(e.staffId) ?? []), e]);
	/** Punches seen so far per person (stored, then accepted), for the 60 s rule. */
	const seen = new Map<string, { type: string; at: number }[]>();
	for (const e of input.existing)
		if (live(e))
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
		const pair = resolveRow(withIn, day.shift, timeZone);
		const ends = [
			{ type: 'check_in' as const, at: pair.checkIn },
			...(pair.checkOut ? [{ type: 'check_out' as const, at: pair.checkOut }] : [])
		];

		const isStored = ends.map((end) => stored.has(key(staffId, end.type, end.at)));
		if (isStored.every(Boolean)) {
			plan.alreadyImported++;
			plan.skipped.push({ line: row.line, reason: 'already_imported' });
			continue;
		}
		const near = (end: (typeof ends)[number]) =>
			(seen.get(staffId) ?? []).some(
				(p) => p.type === end.type && Math.abs(p.at - end.at.getTime()) < DUPLICATE_SECONDS * 1000
			);
		if (ends.some((end, i) => !isStored[i] && near(end))) {
			plan.duplicates++;
			plan.skipped.push({ line: row.line, reason: 'duplicate' });
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
			shift: day.shift,
			others,
			now: input.now,
			timeZone
		});
		const longOk = (input.longSpanIsWarning ?? false) && errors.includes('span_too_long');
		const blocking = longOk ? errors.filter((e) => e !== 'span_too_long') : errors;
		if (blocking.length > 0) {
			reject(row.line, blocking[0] as ImportRejection);
			continue;
		}
		if (longOk) warnings.push('span_too_long');

		const reason = warnings.length > 0 ? input.reason : null;
		plan.pairs.push({
			line: row.line,
			staffId,
			shiftDate: row.date,
			plannedShiftId: day.shift?.id ?? null,
			warnings,
			events: ends
				.filter((_, i) => !isStored[i])
				.map((end) => ({
					staffId,
					type: end.type,
					occurredAt: end.at,
					shiftDate: row.date,
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

// ---------------------------------------------------------------------------------------------
// The in-app punch import (plan 2026-11-11-attendance-import-odoo-and-devices, IM3, IM6): one file
// with punch parts and full-day states. Every line of the file ends in exactly one outcome.

/** A full-day state a punch file may name (IM6), stored as an absence of the same type. */
export const FILE_STATES = ['sick', 'leave', 'mission'] as const;
export type FileState = (typeof FILE_STATES)[number];

/** The upload's column headers (case does not matter); other columns are ignored. */
export const PUNCH_FILE_HEADERS = { ...PUNCH_SHEET_HEADERS, state: 'State' } as const;

/** A full-day state row. */
export type StateRow = { line: number; employeeNo: string; date: string; state: FileState };

export type FileIssue = {
	line: number;
	issue: RowIssue['issue'] | 'bad_state' | 'state_with_times';
};

/** The uploaded table: header names and each row's cells as text (`#lib/server/imports/parse`). */
export type PunchTable = {
	headers: readonly string[];
	rows: readonly { rowNo: number; values: readonly string[] }[];
};

/** `YYYY-MM-DD`, or an Excel date cell turned into `YYYY-MM-DDTHH:mm:ss` text. */
function fileDate(text: string): string | null {
	const value = text.slice(0, 10);
	return DATE.test(value) && (text.length === 10 || text[10] === 'T') ? value : null;
}

/** `HH:mm` (or shorthand), or an Excel time turned into `1899-12-30THH:mm:ss` text. */
function fileClock(text: string): string | null {
	const excel = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(text);
	if (excel) return `${excel[1]}:${excel[2]}`;
	const cell = text === '—' || text === '-' ? '' : text;
	return clockOf(cell);
}

/**
 * The upload's rows. A row holds times (one part of a day) or a state, never both: a mission day
 * with punches is two rows, so each line has one outcome. A row with neither is `empty`; an
 * unreadable employee number, date, time or state is an issue.
 */
export function readPunchFile(table: PunchTable): {
	rows: PunchRow[];
	states: StateRow[];
	issues: FileIssue[];
	empty: number;
} {
	const header = table.headers.map((h) => h.trim().toLowerCase());
	const column = (name: string, required = true) => {
		const index = header.indexOf(name.toLowerCase());
		if (index < 0 && required) throw new MissingHeaderError(name);
		return index;
	};
	const at = {
		employeeNo: column(PUNCH_FILE_HEADERS.employeeNo),
		date: column(PUNCH_FILE_HEADERS.date),
		checkIn: column(PUNCH_FILE_HEADERS.checkIn),
		checkOut: column(PUNCH_FILE_HEADERS.checkOut),
		state: column(PUNCH_FILE_HEADERS.state, false)
	};
	const cell = (values: readonly string[], index: number) =>
		index < 0 ? '' : (values[index] ?? '').trim();

	const rows: PunchRow[] = [];
	const states: StateRow[] = [];
	const issues: FileIssue[] = [];
	let empty = 0;
	for (const { rowNo: line, values } of table.rows) {
		const checkIn = fileClock(cell(values, at.checkIn));
		const checkOut = fileClock(cell(values, at.checkOut));
		const stateText = cell(values, at.state).toLowerCase();
		const hasTimes = checkIn !== '' || checkOut !== '';
		if (!hasTimes && stateText === '') {
			empty++;
			continue;
		}
		const employeeNo = cell(values, at.employeeNo);
		const date = fileDate(cell(values, at.date));
		if (employeeNo === '') issues.push({ line, issue: 'no_employee' });
		else if (date === null) issues.push({ line, issue: 'bad_date' });
		else if (hasTimes && (checkIn === null || checkOut === null))
			issues.push({ line, issue: 'bad_time' });
		else if (stateText !== '' && !(FILE_STATES as readonly string[]).includes(stateText))
			issues.push({ line, issue: 'bad_state' });
		else if (stateText !== '' && hasTimes) issues.push({ line, issue: 'state_with_times' });
		else if (hasTimes)
			rows.push({ line, employeeNo, date, checkIn: checkIn || null, checkOut: checkOut || null });
		else states.push({ line, employeeNo, date, state: stateText as FileState });
	}
	return { rows, states, issues, empty };
}

export type StateRejection = 'not_in_scope' | 'out_of_range' | 'already_absent' | 'state_conflict';

export type StatePlan = {
	accepted: (StateRow & { staffId: string; withPunches: boolean })[];
	rejected: { line: number; reason: StateRejection }[];
	/** The same person, date and state again in the file. */
	skipped: { line: number; reason: 'duplicate' }[];
};

/**
 * Which full-day states to store: the person must be in scope and the date in range; a day that
 * already has an absence in the app is refused (absences never overlap), and so is a second,
 * different state on the same day. `punchDays` (`${staffId} ${date}`) marks a state on a day the
 * file also punches (a mission worked on site): kept, with a flag for the preview.
 */
export function planStateImport(input: {
	states: readonly StateRow[];
	people: ReadonlyMap<string, string>;
	/** `${staffId} ${date}` of days that already have an active absence. */
	absentDays: ReadonlySet<string>;
	punchDays: ReadonlySet<string>;
	from: string;
	to: string;
}): StatePlan {
	const plan: StatePlan = { accepted: [], rejected: [], skipped: [] };
	const taken = new Map<string, FileState>();
	for (const row of input.states) {
		const staffId = input.people.get(row.employeeNo);
		if (!staffId) {
			plan.rejected.push({ line: row.line, reason: 'not_in_scope' });
			continue;
		}
		if (row.date < input.from || row.date > input.to) {
			plan.rejected.push({ line: row.line, reason: 'out_of_range' });
			continue;
		}
		const dayKey = `${staffId} ${row.date}`;
		if (input.absentDays.has(dayKey)) {
			plan.rejected.push({ line: row.line, reason: 'already_absent' });
			continue;
		}
		const earlier = taken.get(dayKey);
		if (earlier !== undefined) {
			if (earlier === row.state) plan.skipped.push({ line: row.line, reason: 'duplicate' });
			else plan.rejected.push({ line: row.line, reason: 'state_conflict' });
			continue;
		}
		taken.set(dayKey, row.state);
		plan.accepted.push({ ...row, staffId, withPunches: input.punchDays.has(dayKey) });
	}
	return plan;
}

/** Consecutive days of one person and state become one absence (`startsOn`–`endsOn`, inclusive). */
export function stateRanges(
	states: readonly { staffId: string; date: string; state: FileState; line: number }[]
): { staffId: string; state: FileState; startsOn: string; endsOn: string; lines: number[] }[] {
	const sorted = [...states].sort(
		(a, b) =>
			a.staffId.localeCompare(b.staffId) ||
			a.state.localeCompare(b.state) ||
			a.date.localeCompare(b.date)
	);
	const ranges: ReturnType<typeof stateRanges> = [];
	for (const s of sorted) {
		const last = ranges.at(-1);
		if (
			last &&
			last.staffId === s.staffId &&
			last.state === s.state &&
			nextDate(last.endsOn) === s.date
		) {
			last.endsOn = s.date;
			last.lines.push(s.line);
		} else
			ranges.push({
				staffId: s.staffId,
				state: s.state,
				startsOn: s.date,
				endsOn: s.date,
				lines: [s.line]
			});
	}
	return ranges;
}

function nextDate(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}
