import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { dayFiguresOf, type DayFigures } from '#lib/attendance/day-result.js';
import { dailyRange, pastDays } from '#lib/attendance/daily-range.js';
import { personSearch, type PersonOption } from '#lib/attendance/person-search.js';
import type { DailySource } from '#lib/schemas/day-results.schema.js';
import type { DayStatus, LogCause, LogField, LogSource } from '#lib/schemas/enums.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { InvalidInputError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { requireActorPermission, type Actor } from '../common.js';
import {
	scopeOptions,
	scopePeople,
	type EntryScope,
	type ScopeOptions
} from '../attendance/attendance.bl.js';
import {
	causeBy,
	MAX_BACKFILL_DAYS,
	recomputeDays,
	type RecomputeResult
} from '../day-results/day-results.bl.js';
import { listStaffToRecompute, listStoredDays } from '../day-results/day-results.crud.js';
import { listShiftRows, type ShiftRow } from '../shifts/shifts.crud.js';
import {
	getPerson,
	listDailyRows,
	listDayLog,
	listEventReasons,
	listHolidayOwners,
	listPayRuleOwners,
	listPeopleMatching,
	listStaffIdsMatching
} from './daily.crud.js';

// The daily attendance page `/attendance/days` (pay plan PR20), the day history (PR24) and the
// stored figures the entry sheet and the employee page show (task 5.3). Viewing needs
// `staff.write`; recomputing a date needs `attendance.record` (PR13).

/** `?scope=department:<id>` / `?scope=team:<id>`; anything else: no scope. */
export function parseScope(value: string | null): EntryScope {
	const [kind, id] = (value ?? '').split(':');
	if (!z.uuid().safeParse(id).success) return null;
	if (kind === 'department') return { departmentId: id };
	if (kind === 'team') return { teamId: id };
	return null;
}

/** `?staff=<id>` (PR45): one picked person; anything else: none. */
export function parseStaffId(value: string | null | undefined): string | null {
	return z.uuid().safeParse(value).success ? (value as string) : null;
}

/** Who the page shows: one picked person (PR45), else a text search (PR42), else everyone. */
export type PersonFilter = {
	/** Employee number or name contains this; `null`: no text search. */
	q: string | null;
	/** Exactly this person; wins over `q`. */
	staffId: string | null;
};

/** The most suggestions the person combobox shows at once. */
export const MAX_PERSON_SUGGESTIONS = 20;

export type DailyFilter = PersonFilter & {
	from: string | null;
	to: string | null;
	scope: EntryScope;
	status: DayStatus | null;
	source: DailySource | null;
};

export type DailyRow = {
	person: { staffId: string; employeeNo: string; fullName: string; fullNameAr: string | null };
	figures: DayFigures;
	/** Waiting for a recompute (it failed after a write); the catch-up repairs it. */
	needsRecompute: boolean;
};

export type DailyPage = ScopeOptions & {
	/** The shown shift dates `[from, to]`: exactly the asked ones (PR44). */
	from: string;
	to: string;
	today: string;
	scope: EntryScope;
	status: DayStatus | null;
	source: DailySource | null;
	q: string | null;
	/** The picked person's id (PR45), as asked; `null` when none. */
	staffId: string | null;
	/** The picked person (PR45), for the combobox's label; `null` when none (or unknown). */
	person: PersonOption | null;
	shifts: ShiftRow[];
	/** One stored row per person and date, newest date first, matching status and source. */
	rows: DailyRow[];
	/** Stored rows of the range, scope and search before the status and source filters. */
	total: number;
	/** Person-days in scope (and matching the search) with no stored row yet ("Recompute these days" creates them). */
	missing: number;
};

/** Does a day match the "Source" filter: either counted time from there, or corrected. */
function matchesSource(figures: DayFigures, source: DailySource): boolean {
	if (source === 'corrected') return figures.corrected;
	const punch = source === 'typed' ? 'manual' : source === 'punch_reading' ? 'import' : 'seed';
	return figures.checkInSource === punch || figures.checkOutSource === punch;
}

const isDate = (value: string | null): value is string =>
	value !== null && z.iso.date().safeParse(value).success;

/** Everyone a scope covers on dates `[from, to]`; no scope: every active person and anyone with punches. */
async function peopleOf(scope: EntryScope, from: string, to: string): Promise<string[]> {
	if (!scope) return listStaffToRecompute(from, to);
	return (await scopePeople(scope, from, to)).map((p) => p.staffId);
}

/** The people a person filter keeps (PR42, PR45), or `null` when there is none. */
async function matchingOf({ q, staffId }: PersonFilter): Promise<Set<string> | null> {
	if (staffId) return new Set([staffId]);
	return q ? new Set(await listStaffIdsMatching(q)) : null;
}

/**
 * The person combobox's suggestions (PR45): people whose employee number or name contains `q`,
 * at most `MAX_PERSON_SUGGESTIONS`, by name. Needs `staff.write`, like the page.
 */
export async function searchPeople(actor: Actor, q: string): Promise<PersonOption[]> {
	requireActorPermission(actor, 'staff.write');
	const search = personSearch(q);
	return search ? listPeopleMatching(search, MAX_PERSON_SUGGESTIONS) : [];
}

/** The people of a scope who match the search; all of them without a search. */
const narrowed = (people: readonly string[], matching: Set<string> | null): string[] =>
	matching ? people.filter((id) => matching.has(id)) : [...people];

/**
 * Stored daily attendance of shift dates `[from, to]` for a scope and person search, filtered by
 * status and source.
 */
export async function getDailyAttendance(actor: Actor, filter: DailyFilter): Promise<DailyPage> {
	requireActorPermission(actor, 'staff.write');
	const today = todayInDamascus();
	const { from, to } = dailyRange(
		isDate(filter.from) ? filter.from : null,
		isDate(filter.to) ? filter.to : null,
		today
	);
	// A picked person replaces the text search.
	const search: PersonFilter = filter.staffId
		? { q: null, staffId: filter.staffId }
		: { q: filter.q, staffId: null };
	const [options, shifts, scoped, matching, person] = await Promise.all([
		scopeOptions(),
		listShiftRows(),
		peopleOf(filter.scope, from, to),
		matchingOf(search),
		search.staffId ? getPerson(search.staffId) : undefined
	]);
	const people = narrowed(scoped, matching);
	// Everyone: every stored row (inactive people's too), or those of the people matching the search.
	const stored = await listDailyRows(
		from,
		to,
		filter.scope ? people : matching ? [...matching] : null
	);
	const inScope = new Set(people);
	const storedInScope = stored.filter((r) => inScope.has(r.person.staffId)).length;
	const rows = stored
		.map((r) => ({
			person: r.person,
			figures: dayFiguresOf(r.values),
			needsRecompute: r.needsRecompute
		}))
		.filter(
			(r) =>
				(!filter.status || r.figures.status === filter.status) &&
				(!filter.source || matchesSource(r.figures, filter.source))
		);
	return {
		...options,
		from,
		to,
		today,
		scope: filter.scope,
		status: filter.status,
		source: filter.source,
		q: search.q,
		staffId: search.staffId,
		person: person ?? null,
		shifts,
		rows,
		total: stored.length,
		// Only dates up to today can be stored (PR18).
		missing: Math.max(0, people.length * pastDays(from, to, today) - storedInScope)
	};
}

/**
 * Recompute shift dates `[from, to]` for a scope's people matching the person search (the page's
 * **Recompute these days**), as the system, with one audit row of the counts. Creates the rows still
 * missing and repairs flagged ones. Dates after today are skipped (they are never stored); refused
 * when more than `MAX_BACKFILL_DAYS` dates remain, the backfill's limit (PR44).
 */
export async function recomputeDailyScope(
	actor: Actor,
	from: string,
	to: string,
	scope: EntryScope,
	search: PersonFilter = { q: null, staffId: null }
): Promise<RecomputeResult & { people: number }> {
	requireActorPermission(actor, 'attendance.record');
	const days = pastDays(from, to, todayInDamascus());
	if (days > MAX_BACKFILL_DAYS)
		throw new InvalidInputError('daily_range', m.daily_error_range({ max: MAX_BACKFILL_DAYS }), {
			field: 'from'
		});
	if (days === 0) return { written: 0, kept: 0, logLines: 0, people: 0 };
	const [scoped, matching] = await Promise.all([peopleOf(scope, from, to), matchingOf(search)]);
	const people = narrowed(scoped, matching);
	const result = await recomputeDays(people, from, to, causeBy(actor, 'system'));
	await batch([
		auditInsert({
			actor: actor.user,
			action: 'day_result.recompute_days',
			entityType: 'day_result',
			entityId: from,
			// The search text may be a name (CLAUDE.md §1): only whether there was one; a picked
			// person is a record ID.
			after: {
				from,
				to,
				scope,
				search: search.q !== null,
				staffId: search.staffId,
				people: people.length,
				...result
			}
		})
	]);
	return { ...result, people: people.length };
}

/** One line of a day's edit log, as the History sheet shows it. */
export type DayHistoryLine = {
	id: string;
	/** ISO instant. */
	at: string;
	field: LogField;
	oldValue: string | number | boolean | null;
	newValue: string | number | boolean | null;
	source: LogSource;
	causeType: LogCause;
	causeId: string | null;
	/** For a holiday or pay-rule cause: its pattern, `null` for the company's, else `undefined`. */
	causePatternId?: string | null;
	/** `null`: the system (backfill, catch-up). */
	actor: { fullName: string; fullNameAr: string | null } | null;
	/** The reason typed with the punch behind the line (cause `event`, PR48), if any. */
	reason: string | null;
};

/** A person's edit log of one shift date (PR24), newest first. */
export async function getDayHistory(
	actor: Actor,
	staffId: string,
	shiftDate: string
): Promise<DayHistoryLine[]> {
	requireActorPermission(actor, 'staff.write');
	const lines = await listDayLog(staffId, shiftDate);
	const idsOf = (type: LogCause) => [
		...new Set(lines.flatMap((l) => (l.causeType === type && l.causeId ? [l.causeId] : [])))
	];
	const [holidays, payRules, reasons] = await Promise.all([
		listHolidayOwners(idsOf('holiday')),
		listPayRuleOwners(idsOf('pay_rule')),
		listEventReasons(idsOf('event'))
	]);
	const ownerOf = new Map([...holidays, ...payRules].map((r) => [r.id, r.patternId]));
	return lines.map((l) => ({
		id: l.id,
		at: l.at.toISOString(),
		field: l.field,
		oldValue: l.oldValue ?? null,
		newValue: l.newValue ?? null,
		source: l.source,
		causeType: l.causeType,
		causeId: l.causeId,
		causePatternId:
			l.causeId && (l.causeType === 'holiday' || l.causeType === 'pay_rule')
				? (ownerOf.get(l.causeId) ?? null)
				: undefined,
		actor: l.actorName ? { fullName: l.actorName, fullNameAr: l.actorNameAr } : null,
		reason: l.causeType === 'event' && l.causeId ? (reasons.get(l.causeId) ?? null) : null
	}));
}

/** A person's stored days on shift dates `[from, to]`, by date (the employee page's day panel). */
export async function listStoredFigures(
	actor: Actor,
	staffId: string,
	from: string,
	to: string
): Promise<Record<string, DayFigures>> {
	requireActorPermission(actor, 'staff.write');
	const stored = await listStoredDays([staffId], from, to);
	return Object.fromEntries(stored.map((s) => [s.values.shiftDate, dayFiguresOf(s.values)]));
}
