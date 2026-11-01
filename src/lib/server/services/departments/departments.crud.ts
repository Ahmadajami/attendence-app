import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { department, departmentManager, staff } from '#lib/server/db/schema/index.js';
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

/** Each department's manager on `date` (at most one, M2), with their names, for the list. */
export async function listManagersOn(date: string) {
	return db
		.select({
			departmentId: departmentManager.departmentId,
			staffId: staff.id,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr
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

/** One department's manager rows (management plan M3), oldest first. */
export async function listDepartmentManagerRows(departmentId: string) {
	return db
		.select({
			id: departmentManager.id,
			staffId: departmentManager.staffId,
			validFrom: departmentManager.validFrom,
			validTo: departmentManager.validTo
		})
		.from(departmentManager)
		.where(eq(departmentManager.departmentId, departmentId))
		.orderBy(asc(departmentManager.validFrom));
}

export type DepartmentManagerRow = Awaited<ReturnType<typeof listDepartmentManagerRows>>[number];

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

export function insertDepartmentManager(values: typeof departmentManager.$inferInsert): BatchQuery {
	return db.insert(departmentManager).values(values);
}

/** End a manager row at `validTo` (exclusive). */
export function closeDepartmentManager(id: string, validTo: string): BatchQuery {
	return db.update(departmentManager).set({ validTo }).where(eq(departmentManager.id, id));
}

/** Remove scheduled manager rows that never took effect (they start on the change date or later). */
export function deleteDepartmentManagers(ids: readonly string[]): BatchQuery {
	return db.delete(departmentManager).where(inArray(departmentManager.id, [...ids]));
}
