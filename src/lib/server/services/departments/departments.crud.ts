import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { department, staff } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

export const departmentColumns = {
	id: department.id,
	nameEn: department.nameEn,
	nameAr: department.nameAr,
	parentId: department.parentId,
	managerStaffId: department.managerStaffId,
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

/** Names of the staff who manage a department (for the list). */
export async function listManagers() {
	return db
		.select({ id: staff.id, fullName: staff.fullName, fullNameAr: staff.fullNameAr })
		.from(staff)
		.innerJoin(department, eq(department.managerStaffId, staff.id));
}

export async function findActiveStaff(id: string) {
	const [row] = await db
		.select({ id: staff.id })
		.from(staff)
		.where(and(eq(staff.id, id), eq(staff.active, true)))
		.limit(1);
	return row;
}

/** Active staff a department can choose as its manager. */
export async function listActiveStaffOptions() {
	return db
		.select({
			id: staff.id,
			employeeNo: staff.employeeNo,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr
		})
		.from(staff)
		.where(eq(staff.active, true))
		.orderBy(asc(staff.fullName));
}

export type StaffOption = Awaited<ReturnType<typeof listActiveStaffOptions>>[number];

export function insertDepartment(values: typeof department.$inferInsert): BatchQuery {
	return db.insert(department).values(values);
}

export function updateDepartment(
	id: string,
	values: Partial<typeof department.$inferInsert>
): BatchQuery {
	return db.update(department).set(values).where(eq(department.id, id));
}
