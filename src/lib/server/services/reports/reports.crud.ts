import { and, asc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { PersonTotals } from '#lib/reports/totals.js';
import { descendantIds } from '#lib/workforce/departments.js';
import { db } from '#lib/server/db/index.js';
import { dayResult, staff, team } from '#lib/server/db/schema/index.js';
import type { EntryScope } from '../attendance/attendance.bl.js';
import { listDepartmentRows } from '../departments/departments.crud.js';

// The reads of the totals report `/reports` (task T1, decisions SP3, SP6): one grouped SQL query
// over `day_result`, summed per person.

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
};

/**
 * One row per person with a stored day on shift dates `[from, to]`, their figures summed in SQL:
 * work days are `kind = 'work'` and leave days a set full-day state (`absence_type`), exactly like
 * `sumTotalsDays`; a day not yet checked out adds no worked time. A team scope filters by
 * `day_result.team_id`; a department scope through the teams of the department and its
 * sub-departments (like the daily page's scope), so days with no team are outside every department
 * scope. By name, then employee number.
 */
export async function listTotalsPeople(
	from: string,
	to: string,
	scope: EntryScope
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

	const rows = await db
		.select({
			person: personColumns,
			workDays: sql<number>`count(*) filter (where ${eq(dayResult.kind, 'work')})::int`,
			leaveDays: sql<number>`count(*) filter (where ${dayResult.absenceType} is not null)::int`,
			requiredMinutes: sql<number>`coalesce(sum(${dayResult.requiredMinutes}), 0)::int`,
			workedMinutes: sql<number>`coalesce(sum(${dayResult.workedMinutes}), 0)::int`,
			overtimeMinutes: sql<number>`coalesce(sum(${dayResult.overtimeMinutes}), 0)::int`,
			lateMinutes: sql<number>`coalesce(sum(${dayResult.lateMinutes}), 0)::int`,
			shortageMinutes: sql<number>`coalesce(sum(${dayResult.shortageMinutes}), 0)::int`,
			creditMinutes: sql<number>`coalesce(sum(${dayResult.creditMinutes}), 0)::int`
		})
		.from(dayResult)
		.innerJoin(staff, eq(staff.id, dayResult.staffId))
		.where(and(gte(dayResult.shiftDate, from), lte(dayResult.shiftDate, to), scoped))
		.groupBy(staff.id, staff.employeeNo, staff.fullName, staff.fullNameAr)
		.orderBy(asc(staff.fullName), asc(staff.employeeNo), asc(staff.id));
	return rows.map(({ person, ...totals }) => ({ person, totals }));
}
