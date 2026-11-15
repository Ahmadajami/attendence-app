import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { containsPattern } from '#lib/attendance/person-search.js';
import {
	capOvertimeMinutes,
	type PersonTotals,
	type TotalsColumn,
	type TotalsSort
} from '#lib/reports/totals.js';
import { descendantIds } from '#lib/workforce/departments.js';
import { db } from '#lib/server/db/index.js';
import { dayResult, staff, team } from '#lib/server/db/schema/index.js';
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
	creditMinutes: sql<number>`coalesce(sum(${dayResult.creditMinutes}), 0)::int`
} satisfies Record<TotalsColumn, SQL<number>>;

const personColumns = {
	staffId: staff.id,
	employeeNo: staff.employeeNo,
	fullName: staff.fullName,
	fullNameAr: staff.fullNameAr
};

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
	capPercent: number | null
): Promise<TotalsPersonRow[]> {
	let scoped: SQL | undefined;
	if (scope && 'teamId' in scope) {
		scoped = eq(dayResult.teamId, scope.teamId);
	} else if (scope) {
		const departments = await listDepartmentRows();
		const ids = [scope.departmentId, ...descendantIds(departments, scope.departmentId)];
		scoped = inArray(
			dayResult.teamId,
			db.select({ id: team.id }).from(team).where(inArray(team.departmentId, ids))
		);
	}

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
			eligibleMinutes: sql<number>`coalesce(sum(${dayResult.paidOtMinutes}), 0)::int`
		})
		.from(dayResult)
		.innerJoin(staff, eq(staff.id, dayResult.staffId))
		.where(and(gte(dayResult.shiftDate, from), lte(dayResult.shiftDate, to), scoped, searched))
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
