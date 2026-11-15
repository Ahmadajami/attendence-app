import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { containsPattern } from '#lib/attendance/person-search.js';
import {
	capOvertimeMinutes,
	type PayDay,
	type PersonDay,
	type PersonTotals,
	type TotalsColumn,
	type TotalsSort,
	shiftHoursOf
} from '#lib/reports/totals.js';
import { descendantIds } from '#lib/workforce/departments.js';
import { db } from '#lib/server/db/index.js';
import { dayResult, shift, staff, team } from '#lib/server/db/schema/index.js';
import type { EntryScope } from '../attendance/attendance.bl.js';
import { listDepartmentRows } from '../departments/departments.crud.js';

// The reads of the totals report `/reports` (task T1, decisions SP3, SP6): one grouped SQL query
// over `day_result`, summed per person.

/** The summed `day_result` columns of the report, one SQL aggregate per shown column (R1 sorts on them). */
const totalsAggregates = {
	workDays: sql<number>`count(*) filter (where ${eq(dayResult.kind, 'work')})::int`,
	leaveDays: sql<number>`count(*) filter (where ${dayResult.absenceType} is not null)::int`,
	requiredMinutes: sql<number>`coalesce(sum(${dayResult.requiredMinutes}), 0)::int`,
	workedMinutes: sql<number>`coalesce(sum(${dayResult.workedMinutes}), 0)::int`,
	overtimeMinutes: sql<number>`coalesce(sum(${dayResult.overtimeMinutes}), 0)::int`,
	lateMinutes: sql<number>`coalesce(sum(${dayResult.lateMinutes}), 0)::int`,
	shortageMinutes: sql<number>`coalesce(sum(${dayResult.shortageMinutes}), 0)::int`,
	// RP15: balance = overtime − shortage, in the same SQL sums.
	balanceMinutes: sql<number>`(coalesce(sum(${dayResult.overtimeMinutes}), 0) - coalesce(sum(${dayResult.shortageMinutes}), 0))::int`,
	creditMinutes: sql<number>`coalesce(sum(${dayResult.creditMinutes}), 0)::int`
} satisfies Record<TotalsColumn, SQL<number>>;

const personColumns = {
	staffId: staff.id,
	employeeNo: staff.employeeNo,
	fullName: staff.fullName,
	fullNameAr: staff.fullNameAr
};

/**
 * The days a scope keeps (the same rule for the table and the person sheet, R2): a team scope by
 * `day_result.team_id`; a department scope through its teams and sub-departments; none: `undefined`.
 */
export async function scopeFilter(scope: EntryScope): Promise<SQL | undefined> {
	if (scope && 'teamId' in scope) return eq(dayResult.teamId, scope.teamId);
	if (!scope) return undefined;
	const departments = await listDepartmentRows();
	const ids = [scope.departmentId, ...descendantIds(departments, scope.departmentId)];
	return inArray(
		dayResult.teamId,
		db.select({ id: team.id }).from(team).where(inArray(team.departmentId, ids))
	);
}

/**
 * One person's stored days on `[from, to]` in the scope, oldest first (R2). Reads only; the shift
 * is `null` on a day without one.
 */
export async function listPersonDays(
	staffId: string,
	from: string,
	to: string,
	scope: EntryScope
): Promise<PersonDay[]> {
	const scoped = await scopeFilter(scope);
	const rows = await db
		.select({
			shiftDate: dayResult.shiftDate,
			shiftCode: shift.code,
			shiftNameEn: shift.nameEn,
			shiftNameAr: shift.nameAr,
			requiredMinutes: dayResult.requiredMinutes,
			workedMinutes: dayResult.workedMinutes,
			overtimeMinutes: dayResult.overtimeMinutes,
			paidOtMinutes: dayResult.paidOtMinutes,
			unpaidExtraMinutes: dayResult.unpaidExtraMinutes,
			unpaidReason: dayResult.unpaidReason,
			otRate: dayResult.otRate,
			lateMinutes: dayResult.lateMinutes,
			shortageMinutes: dayResult.shortageMinutes
		})
		.from(dayResult)
		.leftJoin(shift, eq(shift.id, dayResult.shiftId))
		.where(
			and(
				eq(dayResult.staffId, staffId),
				gte(dayResult.shiftDate, from),
				lte(dayResult.shiftDate, to),
				scoped
			)
		)
		.orderBy(asc(dayResult.shiftDate));
	return rows.map(({ shiftCode, shiftNameEn, shiftNameAr, ...day }) => ({
		...day,
		shift:
			shiftCode === null || shiftNameEn === null || shiftNameAr === null
				? null
				: { code: shiftCode, nameEn: shiftNameEn, nameAr: shiftNameAr }
	}));
}

/** One person's row, or `undefined`: the picked person's details for the combobox's label. */
export async function getPerson(staffId: string) {
	const [row] = await db.select(personColumns).from(staff).where(eq(staff.id, staffId));
	return row;
}

/** One person's summed row of the totals report. */
export type TotalsPersonRow = {
	person: { staffId: string; employeeNo: string; fullName: string; fullNameAr: string | null };
	totals: PersonTotals;
	/** Overtime the pay rule makes eligible (0 when the pattern's overtime is off), and after the cap (R7). */
	overtime: { eligibleMinutes: number; cappedMinutes: number };
};

/**
 * One row per person with a stored day on shift dates `[from, to]`, their figures summed in SQL:
 * work days are `kind = 'work'` and leave days a set full-day state (`absence_type`), exactly like
 * `sumTotalsDays`; a day not yet checked out adds no worked time. A team scope filters by
 * `day_result.team_id`; a department scope through the teams of the department and its
 * sub-departments (like the daily page's scope), so days with no team are outside every department
 * scope. `q` (already trimmed) keeps the people whose employee number or English or Arabic name
 * contains it. Ordered in SQL by `sort` (R1), then by name, employee number and id, so ties are stable.
 */
export async function listTotalsPeople(
	from: string,
	to: string,
	scope: EntryScope,
	sort: TotalsSort,
	q: string,
	capPercent: number | null,
	staffId: string | null
): Promise<TotalsPersonRow[]> {
	const scoped = await scopeFilter(scope);

	let searched: SQL | undefined;
	if (q !== '') {
		const pattern = containsPattern(q);
		searched = or(
			ilike(staff.employeeNo, pattern),
			ilike(staff.fullName, pattern),
			ilike(staff.fullNameAr, pattern)
		);
	}

	const order = sort.dir === 'asc' ? asc : desc;
	const sortBy = sort.key === 'name' ? staff.fullName : totalsAggregates[sort.key];

	const rows = await db
		.select({
			person: personColumns,
			...totalsAggregates,
			// RP23: a day with no required hours and no shift has no hour rate, so it is not eligible.
			eligibleMinutes: sql<number>`coalesce(sum(${dayResult.paidOtMinutes}) filter (where ${dayResult.requiredMinutes} > 0 or ${dayResult.shiftId} is not null), 0)::int`
		})
		.from(dayResult)
		.innerJoin(staff, eq(staff.id, dayResult.staffId))
		.where(
			and(
				gte(dayResult.shiftDate, from),
				lte(dayResult.shiftDate, to),
				scoped,
				searched,
				staffId ? eq(staff.id, staffId) : undefined
			)
		)
		.groupBy(staff.id, staff.employeeNo, staff.fullName, staff.fullNameAr)
		.orderBy(order(sortBy), asc(staff.fullName), asc(staff.employeeNo), asc(staff.id));
	return rows.map(({ person, eligibleMinutes, ...totals }) => ({
		person,
		totals,
		overtime: {
			eligibleMinutes,
			cappedMinutes: capOvertimeMinutes(eligibleMinutes, totals.requiredMinutes, capPercent)
		}
	}));
}

/**
 * The pay inputs of every person with a stored day in `[from, to]` and the scope (R6): their days
 * with the shift's hours (RP23). Read-only; the salary is never here.
 */
export async function listPayDays(
	from: string,
	to: string,
	scope: EntryScope
): Promise<Map<string, PayDay[]>> {
	const scoped = await scopeFilter(scope);
	const rows = await db
		.select({
			staffId: dayResult.staffId,
			requiredMinutes: dayResult.requiredMinutes,
			paidOtMinutes: dayResult.paidOtMinutes,
			otRate: dayResult.otRate,
			shortageMinutes: dayResult.shortageMinutes,
			creditExtraMinutes: dayResult.creditExtraMinutes,
			startTime: shift.startTime,
			endTime: shift.endTime,
			endsNextDay: shift.endsNextDay
		})
		.from(dayResult)
		.leftJoin(shift, eq(shift.id, dayResult.shiftId))
		.where(and(gte(dayResult.shiftDate, from), lte(dayResult.shiftDate, to), scoped));
	const byPerson = new Map<string, PayDay[]>();
	for (const row of rows) {
		const day: PayDay = {
			requiredMinutes: row.requiredMinutes,
			shiftHours:
				row.startTime === null || row.endTime === null || row.endsNextDay === null
					? null
					: shiftHoursOf(row.startTime, row.endTime, row.endsNextDay),
			paidOtMinutes: row.paidOtMinutes,
			otRate: row.otRate,
			shortageMinutes: row.shortageMinutes,
			creditExtraMinutes: row.creditExtraMinutes
		};
		const list = byPerson.get(row.staffId);
		if (list) list.push(day);
		else byPerson.set(row.staffId, [day]);
	}
	return byPerson;
}
