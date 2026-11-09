import { and, asc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { department, departmentManager, staff, team } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

export const departmentColumns = {
	id: department.id,
	nameEn: department.nameEn,
	nameAr: department.nameAr,
	parentId: department.parentId,
	active: department.active
};

export async function listDepartmentRows() {
	return db.select(departmentColumns).from(department).orderBy(asc(department.nameEn));
}

export type DepartmentRow = Awaited<ReturnType<typeof listDepartmentRows>>[number];

export async function findDepartment(id: string): Promise<DepartmentRow | undefined> {
	const [row] = await db
		.select(departmentColumns)
		.from(department)
		.where(eq(department.id, id))
		.limit(1);
	return row;
}

/** Active staff per department. */
export async function countActiveStaffByDepartment() {
	return db
		.select({ departmentId: staff.departmentId, count: sql<number>`count(*)`.mapWith(Number) })
		.from(staff)
		.where(and(eq(staff.active, true), isNotNull(staff.departmentId)))
		.groupBy(staff.departmentId);
}

/** Active staff with a department and their current team, by name: the department's people sheet. */
export async function listActiveDepartmentStaff() {
	return db
		.select({
			staffId: staff.id,
			employeeNo: staff.employeeNo,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			departmentId: staff.departmentId,
			teamNameEn: team.nameEn,
			teamNameAr: team.nameAr
		})
		.from(staff)
		.leftJoin(team, eq(team.id, staff.teamId))
		.where(and(eq(staff.active, true), isNotNull(staff.departmentId)))
		.orderBy(asc(staff.fullName));
}

/** Each department's manager on `date` (at most one, M2), with their names, for the list. */
export async function listManagersOn(date: string) {
	return db
		.select({
			departmentId: departmentManager.departmentId,
			staffId: staff.id,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			active: staff.active
		})
		.from(departmentManager)
		.innerJoin(staff, eq(staff.id, departmentManager.staffId))
		.where(
			and(
				lte(departmentManager.validFrom, date),
				or(isNull(departmentManager.validTo), gt(departmentManager.validTo, date))
			)
		);
}

export function insertDepartment(values: typeof department.$inferInsert): BatchQuery {
	return db.insert(department).values(values);
}

export function updateDepartment(
	id: string,
	values: Partial<typeof department.$inferInsert>
): BatchQuery {
	return db.update(department).set(values).where(eq(department.id, id));
}
