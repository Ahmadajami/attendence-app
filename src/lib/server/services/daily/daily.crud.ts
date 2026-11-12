import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	lte,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { containsPattern } from '#lib/attendance/person-search.js';
import type { DailySource } from '#lib/schemas/day-results.schema.js';
import type { DayStatus } from '#lib/schemas/enums.js';
import { db } from '#lib/server/db/index.js';
import {
	attendanceEvent,
	attendanceLog,
	dayResult,
	patternHoliday,
	patternPayRule,
	staff,
	user
} from '#lib/server/db/schema/index.js';
import { toValues } from '../day-results/day-results.crud.js';

// Reads of the daily attendance page and the day history (pay plan PR20, PR24).

const personColumns = {
	staffId: staff.id,
	employeeNo: staff.employeeNo,
	fullName: staff.fullName,
	fullNameAr: staff.fullNameAr
};

/** The Status and Source filters of the daily page; `null`: not filtered. */
export type DailyRowFilter = { status: DayStatus | null; source: DailySource | null };

/** The punch source a "Source" filter value stands for (`corrected` is its own column). */
const PUNCH_SOURCE = { typed: 'manual', punch_reading: 'import', odoo_seed: 'seed' } as const;

/** Stored rows of shift dates `[from, to]`; only these people unless `null` (all). */
const inRange = (from: string, to: string, staffIds: readonly string[] | null) =>
	and(
		gte(dayResult.shiftDate, from),
		lte(dayResult.shiftDate, to),
		staffIds === null ? undefined : inArray(dayResult.staffId, [...staffIds])
	);

/**
 * The Status and Source filters as a condition, `undefined` without one. Source: either counted
 * time came from there, or a counted time was corrected.
 */
function matchesFilter({ status, source }: DailyRowFilter): SQL | undefined {
	const punch = source && source !== 'corrected' ? PUNCH_SOURCE[source] : null;
	return and(
		status ? eq(dayResult.status, status) : undefined,
		source === 'corrected' ? eq(dayResult.corrected, true) : undefined,
		punch ? or(eq(dayResult.checkInSource, punch), eq(dayResult.checkOutSource, punch)) : undefined
	);
}

/**
 * One page of the stored rows of shift dates `[from, to]` matching the filters: newest date first,
 * then by name (employee number and id break ties, so the pages never overlap). Only these people
 * unless `null` (all).
 */
export async function listDailyRows(
	from: string,
	to: string,
	staffIds: readonly string[] | null,
	filter: DailyRowFilter,
	page: { limit: number; offset: number }
) {
	if (staffIds !== null && staffIds.length === 0) return [];
	const rows = await db
		.select({ day: dayResult, person: personColumns })
		.from(dayResult)
		.innerJoin(staff, eq(staff.id, dayResult.staffId))
		.where(and(inRange(from, to, staffIds), matchesFilter(filter)))
		.orderBy(desc(dayResult.shiftDate), asc(staff.fullName), asc(staff.employeeNo), asc(staff.id))
		.limit(page.limit)
		.offset(page.offset);
	return rows.map(({ day, person }) => ({
		person,
		values: toValues(day),
		needsRecompute: day.needsRecompute
	}));
}

/**
 * The counts of the same rows over the whole range, whatever the page: `total` before the Status
 * and Source filters, `matching` after them, and `inScope`, how many of `total` belong to
 * `scopeIds` (for the "no stored record yet" count).
 */
export async function countDailyRows(
	from: string,
	to: string,
	staffIds: readonly string[] | null,
	scopeIds: readonly string[],
	filter: DailyRowFilter
): Promise<{ total: number; matching: number; inScope: number }> {
	if (staffIds !== null && staffIds.length === 0) return { total: 0, matching: 0, inScope: 0 };
	const matches = matchesFilter(filter);
	const [row] = await db
		.select({
			total: count(),
			matching: matches ? sql<number>`count(*) filter (where ${matches})::int` : count(),
			inScope:
				scopeIds.length > 0
					? sql<number>`count(*) filter (where ${inArray(dayResult.staffId, [...scopeIds])})::int`
					: sql<number>`0`
		})
		.from(dayResult)
		.where(inRange(from, to, staffIds));
	return row ?? { total: 0, matching: 0, inScope: 0 };
}

/** Everyone (active or not) whose employee number or name, English or Arabic, contains `q`. */
export async function listStaffIdsMatching(q: string): Promise<string[]> {
	const pattern = containsPattern(q);
	const rows = await db
		.select({ id: staff.id })
		.from(staff)
		.where(
			or(
				ilike(staff.employeeNo, pattern),
				ilike(staff.fullName, pattern),
				ilike(staff.fullNameAr, pattern)
			)
		);
	return rows.map((r) => r.id);
}

/**
 * The person combobox's suggestions (PR45): at most `limit` people (active or not) whose employee
 * number or name contains `q`, by name.
 */
export async function listPeopleMatching(q: string, limit: number) {
	const pattern = containsPattern(q);
	return db
		.select(personColumns)
		.from(staff)
		.where(
			or(
				ilike(staff.employeeNo, pattern),
				ilike(staff.fullName, pattern),
				ilike(staff.fullNameAr, pattern)
			)
		)
		.orderBy(asc(staff.fullName), asc(staff.employeeNo))
		.limit(limit);
}

/** One person's number and names, or `undefined`. */
export async function getPerson(staffId: string) {
	const [row] = await db.select(personColumns).from(staff).where(eq(staff.id, staffId));
	return row;
}

/** The reasons typed with these events (PR48), by event id; events without one are left out. */
export async function listEventReasons(ids: readonly string[]): Promise<Map<string, string>> {
	if (ids.length === 0) return new Map();
	const rows = await db
		.select({ id: attendanceEvent.id, reason: attendanceEvent.reason })
		.from(attendanceEvent)
		.where(inArray(attendanceEvent.id, [...ids]));
	return new Map(rows.flatMap((r) => (r.reason ? [[r.id, r.reason] as const] : [])));
}

/** One person's edit log of one shift date, newest first, with who made each change. */
export async function listDayLog(staffId: string, shiftDate: string) {
	return db
		.select({
			id: attendanceLog.id,
			field: attendanceLog.field,
			oldValue: attendanceLog.oldValue,
			newValue: attendanceLog.newValue,
			source: attendanceLog.source,
			causeType: attendanceLog.causeType,
			causeId: attendanceLog.causeId,
			at: attendanceLog.at,
			actorName: user.fullName,
			actorNameAr: user.fullNameAr
		})
		.from(attendanceLog)
		.leftJoin(user, eq(user.id, attendanceLog.actorId))
		.where(and(eq(attendanceLog.staffId, staffId), eq(attendanceLog.shiftDate, shiftDate)))
		.orderBy(desc(attendanceLog.at), desc(attendanceLog.id));
}

export type DayLogRow = Awaited<ReturnType<typeof listDayLog>>[number];

/** The owner (pattern id, `null` for the company) of these holidays. */
export async function listHolidayOwners(ids: readonly string[]) {
	if (ids.length === 0) return [];
	return db
		.select({ id: patternHoliday.id, patternId: patternHoliday.patternId })
		.from(patternHoliday)
		.where(inArray(patternHoliday.id, [...ids]));
}

/** The owner (pattern id, `null` for the company) of these pay-rule versions. */
export async function listPayRuleOwners(ids: readonly string[]) {
	if (ids.length === 0) return [];
	return db
		.select({ id: patternPayRule.id, patternId: patternPayRule.patternId })
		.from(patternPayRule)
		.where(inArray(patternPayRule.id, [...ids]));
}
