import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import {
	clockOf,
	pairsOf,
	resolveCheckIn,
	resolveCheckOut,
	resolvePair,
	toPairs,
	validatePair,
	type Pair,
	type PairIssue
} from '#lib/attendance/entry.js';
import { dayFiguresOf, type DayFigures } from '#lib/attendance/day-result.js';
import { pairIssueMessage } from '#lib/attendance/labels.js';
import { addDays, startOfDamascusDay } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import { rosterDay, type RosterDay } from '#lib/roster/roster.js';
import type {
	AddPairInput,
	CorrectionInput,
	DayPunchesInput,
	EntryAbsence,
	EntryRow,
	EntrySheetInput
} from '#lib/schemas/attendance.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { damascusDayRange, todayInDamascus } from '#lib/server/time.js';
import { descendantIds, flattenTree } from '#lib/workforce/departments.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import {
	causeBy,
	markNeedsRecompute,
	recomputeAfter,
	type RecomputeCause
} from '../day-results/day-results.bl.js';
import { listStoredDays } from '../day-results/day-results.crud.js';
import { listDepartmentRows } from '../departments/departments.crud.js';
import { listTeamMembersBetween } from '../roster/roster.crud.js';
import { loadRosterData } from '../roster/roster.bl.js';
import type { ShiftRow } from '../shifts/shifts.crud.js';
import { listTeams as listTeamRows } from '../teams/teams.crud.js';
import {
	findEvent,
	insertAbsences,
	insertEvents,
	listActiveStaffInDepartments,
	listEntryPeople,
	listEventsBetween,
	type EntryPersonRow,
	type EventRow
} from './attendance.crud.js';

/** Whose sheet: a department (with its sub-departments) or a team. */
export type EntryScope = { departmentId: string } | { teamId: string } | null;

export type EntrySheetRow = {
	person: EntryPersonRow;
	day: RosterDay;
	/** The person's events on this shift date (corrected ones too). */
	events: EventRow[];
	/** Their other effective pairs around the date, for the overlap check in the browser. */
	others: Pair[];
	/** The stored daily record (pay plan task 5.3); `null` until the day is computed. */
	figures: DayFigures | null;
};

export type EntrySheet = {
	shiftDate: string;
	today: string;
	scope: EntryScope;
	departments: { id: string; nameEn: string; nameAr: string; depth: number }[];
	teams: { id: string; nameEn: string; nameAr: string }[];
	/** Every shift (rows may show an inactive planned one); new rows offer the active ones. */
	shifts: ShiftRow[];
	/** People planned that day, or with punches or an absence on it. */
	rows: EntrySheetRow[];
	/** Everyone else in scope, for "+ add person". */
	others: { person: EntryPersonRow; day: RosterDay; others: Pair[] }[];
};

/** A refused batch: what is wrong with which row (index into the posted rows). */
export class EntrySheetError extends InvalidInputError {
	constructor(readonly issues: { index: number; field: keyof EntryRow; message: string }[]) {
		super('entry_invalid', m.attendance_error_rows({ count: issues.length }));
	}
}

const ISSUE_FIELD: Record<PairIssue, keyof EntryRow> = {
	span_too_long: 'checkOut',
	overlap: 'checkIn',
	future: 'checkIn',
	outside_window: 'checkIn',
	unplanned: 'reason'
};

/** The roster's planned shift on a day, `null` when it plans none (off, holiday, absence). */
function plannedShift(day: RosterDay) {
	return day.shift && day.start ? day.shift : null;
}

/**
 * The people of a scope on shift dates `[shiftDate, lastDate]`: active department staff, or the
 * active members of the team at any time in those dates.
 */
export async function scopePeople(
	scope: EntryScope,
	shiftDate: string,
	lastDate: string = shiftDate
): Promise<EntryPersonRow[]> {
	if (!scope) return [];
	if ('teamId' in scope) {
		const members = await listTeamMembersBetween(
			scope.teamId,
			startOfDamascusDay(shiftDate),
			startOfDamascusDay(addDays(lastDate, 1))
		);
		const unique = members.filter(
			(row, i, all) => all.findIndex((r) => r.staffId === row.staffId) === i
		);
		return unique.filter((p) => p.active);
	}
	const departments = await listDepartmentRows();
	const ids = [scope.departmentId, ...descendantIds(departments, scope.departmentId)];
	return listActiveStaffInDepartments(ids);
}

/** Everything the checks need for these people around one shift date. */
async function loadContext(people: readonly EntryPersonRow[], shiftDate: string) {
	const ids = people.map((p) => p.staffId);
	const [roster, events] = await Promise.all([
		loadRosterData(people, shiftDate, 1),
		// A pair is at most 16 h, so only the neighbouring shift dates can overlap.
		listEventsBetween(ids, addDays(shiftDate, -1), addDays(shiftDate, 1))
	]);
	const dayOf = (staffId: string) => rosterDay(rosterInputOf(roster, staffId), shiftDate);
	const eventsOf = (staffId: string) => events.filter((e) => e.staffId === staffId);
	/** The person's event pairs, paired within each shift date. */
	const eventPairs = (staffId: string) => {
		const mine = eventsOf(staffId);
		const dates = [...new Set(mine.map((e) => e.shiftDate))];
		return dates.flatMap((d) => pairsOf(mine.filter((e) => e.shiftDate === d)));
	};
	/** Effective pairs as instants: all, only on the shift date, or only on the other dates. */
	const pairsOfPerson = (staffId: string, onDate: boolean | null = null) =>
		toPairs(
			eventPairs(staffId).filter(
				(p) => onDate === null || ((p.checkIn ?? p.checkOut)?.shiftDate === shiftDate) === onDate
			)
		);
	return { roster, dayOf, eventsOf, eventPairs, pairsOfPerson };
}

export type ScopeOptions = Pick<EntrySheet, 'departments' | 'teams'>;

/** The active departments (as a tree, with depth) and teams a scope picker offers. */
export async function scopeOptions(): Promise<ScopeOptions> {
	const [departments, teams] = await Promise.all([listDepartmentRows(), listTeamRows()]);
	return {
		departments: flattenTree(
			departments.filter((d) => d.active),
			(a, b) => a.nameEn.localeCompare(b.nameEn)
		).map(({ id, nameEn, nameAr, depth }) => ({ id, nameEn, nameAr, depth })),
		teams: teams.filter((t) => t.active).map(({ id, nameEn, nameAr }) => ({ id, nameEn, nameAr }))
	};
}

/** The entry sheet of one shift date for a department or a team. */
export async function getEntrySheet(
	actor: Actor,
	date: string | null,
	scope: EntryScope
): Promise<EntrySheet> {
	requireActorPermission(actor, 'attendance.record');
	const shiftDate = damascusDayRange(date).day;
	const [options, people] = await Promise.all([scopeOptions(), scopePeople(scope, shiftDate)]);
	const [ctx, stored] = await Promise.all([
		loadContext(people, shiftDate),
		listStoredDays(
			people.map((p) => p.staffId),
			shiftDate,
			shiftDate
		)
	]);
	const figuresOf = new Map(stored.map((s) => [s.values.staffId, dayFiguresOf(s.values)]));

	const rows: EntrySheetRow[] = [];
	const others: EntrySheet['others'] = [];
	for (const person of people) {
		const day = ctx.dayOf(person.staffId);
		const events = ctx.eventsOf(person.staffId).filter((e) => e.shiftDate === shiftDate);
		const around = ctx.pairsOfPerson(person.staffId, false);
		if (day.shift || day.source === 'absence' || events.length > 0)
			rows.push({
				person,
				day,
				events,
				others: around,
				figures: figuresOf.get(person.staffId) ?? null
			});
		else others.push({ person, day, others: around });
	}

	return {
		shiftDate,
		today: todayInDamascus(),
		scope,
		...options,
		shifts: ctx.roster.shifts,
		rows,
		others
	};
}

/**
 * Check every row with the same helpers the sheet uses, then write all of them or none: one
 * batch of events (`source = manual`) and absences, with one audit row of ids and counts. A punch
 * has no shift: it is read and checked against the roster's planned shift (plan PS1–PS5); warnings
 * (a day off, times outside the planned shift) never refuse it.
 */
async function recordRows(
	actor: Actor,
	shiftDate: string,
	rows: readonly { index: number; row: EntryRow }[]
): Promise<{ events: number; absences: number }> {
	const people = await listEntryPeople([...new Set(rows.map((r) => r.row.staffId))]);
	const byId = new Map(people.map((p) => [p.staffId, p]));
	const ctx = await loadContext(people, shiftDate);
	const now = new Date();

	const issues: EntrySheetError['issues'] = [];
	const events: Parameters<typeof insertEvents>[0] = [];
	const absences: Parameters<typeof insertAbsences>[0] = [];
	const accepted = new Map<string, Pair[]>();

	for (const { index, row } of rows) {
		const refuse = (field: keyof EntryRow, message: string) =>
			issues.push({ index, field, message });
		const person = byId.get(row.staffId);
		if (!person?.active) {
			refuse('staffId', m.attendance_error_person());
			continue;
		}
		const day = ctx.dayOf(row.staffId);
		if (row.absence) {
			if (day.source === 'absence') refuse('absence', m.attendance_error_already_absent());
			else
				absences.push({
					id: randomUUID(),
					staffId: row.staffId,
					startsOn: shiftDate,
					endsOn: shiftDate,
					type: row.absence satisfies EntryAbsence,
					reason: row.reason || null,
					recordedBy: actor.user.id
				});
			continue;
		}
		const shift = plannedShift(day);
		const pair = resolvePair(shiftDate, shift, row.checkIn, row.checkOut || null);
		const mine = accepted.get(row.staffId) ?? [];
		const { errors } = validatePair(pair, {
			shiftDate,
			shift,
			others: [...ctx.pairsOfPerson(row.staffId), ...mine],
			now
		});
		if (errors.length > 0) {
			for (const p of errors) refuse(ISSUE_FIELD[p], pairIssueMessage(p));
			continue;
		}

		accepted.set(row.staffId, [...mine, pair]);
		const base = {
			staffId: row.staffId,
			shiftDate,
			teamId: day.teamId,
			recordedBy: actor.user.id,
			source: 'manual' as const
		};
		events.push({
			...base,
			id: randomUUID(),
			type: 'check_in',
			occurredAt: pair.checkIn,
			reason: row.reason || null
		});
		if (pair.checkOut)
			events.push({ ...base, id: randomUUID(), type: 'check_out', occurredAt: pair.checkOut });
	}

	if (issues.length > 0) throw new EntrySheetError(issues);
	if (events.length === 0 && absences.length === 0)
		throw new InvalidInputError('entry_empty', m.attendance_error_empty());

	const touched = [...new Set([...events, ...absences].map((r) => r.staffId))];
	try {
		await batch([
			...insertEvents(events),
			...insertAbsences(absences),
			...markNeedsRecompute(touched, shiftDate, shiftDate),
			auditInsert({
				actor: actor.user,
				action: 'attendance.entry',
				entityType: 'attendance_sheet',
				entityId: shiftDate,
				// Ids and counts only: an absence reason may hold health details.
				after: {
					eventIds: events.map((e) => e.id),
					absenceIds: absences.map((a) => a.id),
					events: events.length,
					absences: absences.length
				}
			})
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23P01')
			throw new ConflictError('absence_overlap', m.attendance_error_absence_overlap(), {
				cause: error
			});
		throw error;
	}
	// Each person's day, logged as typed, pointing at their absence or first punch (PR23).
	const causeOf = new Map<string, RecomputeCause>();
	for (const a of absences) causeOf.set(a.staffId, causeBy(actor, 'typed', 'absence', a.id));
	for (const e of events)
		if (!causeOf.has(e.staffId)) causeOf.set(e.staffId, causeBy(actor, 'typed', 'event', e.id));
	await recomputeAfter(
		touched,
		shiftDate,
		shiftDate,
		(staffId) => causeOf.get(staffId) ?? causeBy(actor, 'typed')
	);
	return { events: events.length, absences: absences.length };
}

/** Save an entry sheet: every non-empty row, or none of them. */
export async function saveEntrySheet(actor: Actor, input: EntrySheetInput) {
	requireActorPermission(actor, 'attendance.record');
	const rows = input.rows
		.map((row, index) => ({ index, row }))
		.filter(({ row }) => row.checkIn || row.checkOut || row.absence);
	return recordRows(actor, input.shiftDate, rows);
}

/** One pair from the employee page's day panel. */
export async function addPair(actor: Actor, input: AddPairInput) {
	requireActorPermission(actor, 'attendance.record');
	const { shiftDate, ...rest } = input;
	try {
		return await recordRows(actor, shiftDate, [{ index: 0, row: { ...rest, absence: '' } }]);
	} catch (error) {
		if (error instanceof EntrySheetError)
			throw new InvalidInputError('pair_invalid', error.issues.map((i) => i.message).join(' '));
		throw error;
	}
}

/**
 * Correct an effective event: a new event that points at it, with the new time (resolved like
 * the entry sheet does) or, with no time, a void correction that removes it. The original stays.
 */
export async function correctEvent(actor: Actor, input: CorrectionInput): Promise<void> {
	requireActorPermission(actor, 'attendance.record');
	const event = await findEvent(input.eventId);
	if (!event) throw new NotFoundError(m.attendance_error_event());
	const [person] = await listEntryPeople([event.staffId]);
	if (!person) throw new NotFoundError(m.attendance_error_event());
	const ctx = await loadContext([person], event.shiftDate);
	const all = ctx.eventsOf(event.staffId);
	if (event.isVoid || all.some((e) => e.correctsEventId === event.id))
		throw new ConflictError('already_corrected', m.attendance_error_already_corrected());
	const shift = plannedShift(ctx.dayOf(event.staffId));

	let occurredAt = event.occurredAt;
	if (!input.voidEvent) {
		const pairs = ctx.eventPairs(event.staffId);
		const own = pairs.find((p) => p.checkIn?.id === event.id || p.checkOut?.id === event.id);
		occurredAt =
			event.type === 'check_out' && own?.checkIn
				? resolveCheckOut(own.checkIn.occurredAt, input.time)
				: resolveCheckIn(event.shiftDate, shift, input.time);

		// Check the pair as it will be, against the person's other pairs.
		const pair: Pair =
			event.type === 'check_out'
				? { checkIn: own?.checkIn?.occurredAt ?? occurredAt, checkOut: occurredAt }
				: { checkIn: occurredAt, checkOut: own?.checkOut?.occurredAt ?? null };
		const others = toPairs(pairs.filter((p) => p !== own));
		const { errors } = validatePair(pair, {
			shiftDate: event.shiftDate,
			shift,
			others,
			now: new Date()
		});
		if (errors.length > 0)
			throw new InvalidInputError('correction_invalid', errors.map(pairIssueMessage).join(' '), {
				field: 'time'
			});
	}

	const id = randomUUID();
	await batch([
		...insertEvents([
			{
				id,
				staffId: event.staffId,
				type: event.type,
				occurredAt,
				shiftDate: event.shiftDate,
				teamId: event.teamId,
				recordedBy: actor.user.id,
				source: 'manual',
				correctsEventId: event.id,
				reason: input.reason,
				isVoid: input.voidEvent
			}
		]),
		...markNeedsRecompute([event.staffId], event.shiftDate, event.shiftDate),
		auditInsert({
			actor: actor.user,
			action: input.voidEvent ? 'attendance.void' : 'attendance.correct',
			entityType: 'attendance_event',
			entityId: event.id,
			after: { correctionId: id }
		})
	]);
	await recomputeAfter(
		[event.staffId],
		event.shiftDate,
		event.shiftDate,
		causeBy(actor, 'correction', 'event', id)
	);
}

/** The roster's planned shift the day editor shows (PR46): its name and times. */
export type DayPunchShift = Pick<
	ShiftRow,
	'id' | 'code' | 'nameEn' | 'nameAr' | 'startTime' | 'endTime'
>;

/** What the day editor shows of one person's shift date (PR46). */
export type DayPunches = {
	/** The roster's shift that day; `null`: a day off (punches carry no shift, plan PS1). */
	plannedShift: DayPunchShift | null;
	/** The day has a full-day state: punches count for nothing and are not edited here. */
	hasState: boolean;
	/** The day's effective pairs as Damascus wall-clock `HH:mm`; at most one can be edited here. */
	pairs: { checkIn: string | null; checkOut: string | null }[];
};

/** The person, the roster day and the day's effective pairs, for the day editor. */
async function loadDayPunches(staffId: string, shiftDate: string) {
	const [person] = await listEntryPeople([staffId]);
	if (!person) throw new NotFoundError(m.attendance_error_person());
	const ctx = await loadContext([person], shiftDate);
	const day = ctx.dayOf(staffId);
	const pairs = ctx
		.eventPairs(staffId)
		.filter((p) => (p.checkIn ?? p.checkOut)?.shiftDate === shiftDate);
	return { person, ctx, day, pairs };
}

/** One person's check-in / check-out on a shift date, for the day editor (PR46). */
export async function getDayPunches(
	actor: Actor,
	staffId: string,
	shiftDate: string
): Promise<DayPunches> {
	requireActorPermission(actor, 'attendance.record');
	const { day, pairs } = await loadDayPunches(staffId, shiftDate);
	const clock = (event: EventRow | null) => (event ? clockOf(event.occurredAt) : null);
	const shift = plannedShift(day);
	return {
		plannedShift: shift
			? {
					id: shift.id,
					code: shift.code,
					nameEn: shift.nameEn,
					nameAr: shift.nameAr,
					startTime: shift.startTime,
					endTime: shift.endTime
				}
			: null,
		hasState: day.source === 'absence',
		pairs: pairs.map((p) => ({ checkIn: clock(p.checkIn), checkOut: clock(p.checkOut) }))
	};
}

/**
 * The day editor's check-in / check-out (PR46–PR48). No pair yet: a new pair, read and checked
 * against the roster's planned shift like the entry sheet (no shift on the punch, plan PS1). One pair: a correction for each time that changed (the original
 * stays), a void correction when the check-out is emptied, a new check-out when there was none.
 * Refused on a day with a full-day state or with several pairs. Every event written carries the
 * reason; one audit row with the event ids and the times before and after; the day is recomputed
 * and logged as typed (new pair) or correction, pointing at the first event written.
 */
export async function setDayPunches(
	actor: Actor,
	input: DayPunchesInput
): Promise<{ events: number }> {
	requireActorPermission(actor, 'attendance.record');
	const { staffId, shiftDate } = input;
	const { person, ctx, day, pairs } = await loadDayPunches(staffId, shiftDate);
	if (day.source === 'absence') throw new ConflictError('day_has_state', m.day_punches_has_state());
	if (pairs.length > 1) throw new ConflictError('several_pairs', m.day_punches_several());
	const existing = pairs[0] ?? null;
	const shift = plannedShift(day);
	if (!existing && !person.active)
		throw new InvalidInputError('person_inactive', m.attendance_error_person());

	const pair = resolvePair(shiftDate, shift, input.checkIn, input.checkOut || null);
	// The person's other pairs, by event id: `eventPairs` builds new objects on every call, so the
	// pair being edited must not be compared by identity (it would overlap itself).
	const editedIds = new Set(
		[existing?.checkIn?.id, existing?.checkOut?.id].filter((id): id is string => !!id)
	);
	const others = toPairs(
		ctx
			.eventPairs(staffId)
			.filter((p) => !editedIds.has(p.checkIn?.id ?? '') && !editedIds.has(p.checkOut?.id ?? ''))
	);
	const { errors } = validatePair(pair, {
		shiftDate,
		shift,
		others,
		now: new Date()
	});
	if (errors.length > 0)
		throw new InvalidInputError('punches_invalid', errors.map(pairIssueMessage).join(' '), {
			field: errors.includes('span_too_long') ? 'checkOut' : 'checkIn'
		});

	const base = {
		staffId,
		shiftDate,
		teamId: day.teamId,
		recordedBy: actor.user.id,
		source: 'manual' as const,
		reason: input.reason
	};
	const events: Parameters<typeof insertEvents>[0] = [];
	const same = (a: Date | null, b: Date | null) =>
		(a?.getTime() ?? null) === (b?.getTime() ?? null);
	/** A new event, or a correction of `old` when the time changed; nothing when it did not. */
	const write = (type: 'check_in' | 'check_out', old: EventRow | null, at: Date | null) => {
		if (old && same(old.occurredAt, at)) return;
		if (!old && !at) return;
		events.push({
			...base,
			id: randomUUID(),
			type,
			occurredAt: at ?? old!.occurredAt,
			...(old ? { teamId: old.teamId, correctsEventId: old.id, isVoid: at === null } : {})
		});
	};
	write('check_in', existing?.checkIn ?? null, pair.checkIn);
	write('check_out', existing?.checkOut ?? null, pair.checkOut);
	if (events.length === 0)
		throw new InvalidInputError('punches_unchanged', m.day_punches_unchanged());

	const corrected = events.some((e) => e.correctsEventId);
	const clocks = (p: { checkIn: Date | null; checkOut: Date | null }) => ({
		checkIn: p.checkIn ? clockOf(p.checkIn) : null,
		checkOut: p.checkOut ? clockOf(p.checkOut) : null
	});
	await batch([
		...insertEvents(events),
		...markNeedsRecompute([staffId], shiftDate, shiftDate),
		auditInsert({
			actor: actor.user,
			action: 'attendance.day_punches',
			entityType: 'attendance_day',
			entityId: staffId,
			// Times and ids only; the reason stays on the events.
			before: existing
				? clocks({
						checkIn: existing.checkIn?.occurredAt ?? null,
						checkOut: existing.checkOut?.occurredAt ?? null
					})
				: null,
			after: { shiftDate, eventIds: events.map((e) => e.id), ...clocks(pair) }
		})
	]);
	await recomputeAfter(
		[staffId],
		shiftDate,
		shiftDate,
		causeBy(actor, corrected ? 'correction' : 'typed', 'event', events[0].id)
	);
	return { events: events.length };
}

/** A person's events (corrections and corrected ones too) on shift dates `[from, to]`. */
export async function listPersonEvents(
	actor: Actor,
	staffId: string,
	from: string,
	to: string
): Promise<EventRow[]> {
	requireActorPermission(actor, 'attendance.record');
	return listEventsBetween([staffId], from, to);
}

/** Many people's events on shift dates `[from, to]`, for a team preview. */
export async function listPeopleEvents(
	actor: Actor,
	staffIds: readonly string[],
	from: string,
	to: string
): Promise<EventRow[]> {
	requireActorPermission(actor, 'attendance.record');
	return listEventsBetween(staffIds, from, to);
}
