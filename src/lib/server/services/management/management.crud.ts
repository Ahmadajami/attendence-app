import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	department,
	departmentManager,
	staff,
	staffTeamMembership,
	team,
	teamSupervisor
} from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// Two-level management (task 3.2): the whole organisation for the engine
// (`#lib/workforce/management.ts`), and the dated manager rows (`department_manager`, M3).
// Hundreds of people, not thousands: everything is loaded at once and filtered in TS.

/** Every department, team, person, manager row, supervisor row and membership, with names. */
export async function loadOrgRows() {
	const [departments, teams, people, managers, supervisors, memberships] = await Promise.all([
		db
			.select({
				id: department.id,
				parentId: department.parentId,
				active: department.active,
				nameEn: department.nameEn,
				nameAr: department.nameAr
			})
			.from(department)
			.orderBy(asc(department.nameEn)),
		db
			.select({
				id: team.id,
				departmentId: team.departmentId,
				active: team.active,
				nameEn: team.nameEn,
				nameAr: team.nameAr
			})
			.from(team)
			.orderBy(asc(team.nameEn)),
		db
			.select({
				staffId: staff.id,
				departmentId: staff.departmentId,
				active: staff.active,
				employeeNo: staff.employeeNo,
				fullName: staff.fullName,
				fullNameAr: staff.fullNameAr
			})
			.from(staff)
			.orderBy(asc(staff.fullName)),
		db
			.select({
				id: departmentManager.id,
				departmentId: departmentManager.departmentId,
				staffId: departmentManager.staffId,
				validFrom: departmentManager.validFrom,
				validTo: departmentManager.validTo
			})
			.from(departmentManager)
			.orderBy(asc(departmentManager.validFrom)),
		db
			.select({
				teamId: teamSupervisor.teamId,
				staffId: teamSupervisor.staffId,
				addedAt: teamSupervisor.addedAt,
				removedAt: teamSupervisor.removedAt
			})
			.from(teamSupervisor),
		db
			.select({
				staffId: staffTeamMembership.staffId,
				teamId: staffTeamMembership.teamId,
				validFrom: staffTeamMembership.validFrom,
				validTo: staffTeamMembership.validTo
			})
			.from(staffTeamMembership)
	]);
	return { departments, teams, people, managers, supervisors, memberships };
}

export type OrgRows = Awaited<ReturnType<typeof loadOrgRows>>;

export async function findDepartmentForManager(id: string) {
	const [row] = await db
		.select({ id: department.id, active: department.active })
		.from(department)
		.where(eq(department.id, id))
		.limit(1);
	return row;
}

export async function findStaffForManager(id: string) {
	const [row] = await db
		.select({ id: staff.id, active: staff.active })
		.from(staff)
		.where(eq(staff.id, id))
		.limit(1);
	return row;
}

/** One department's manager rows (M3), oldest first. */
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

/** One department's manager history with names and reasons, newest first. */
export async function listDepartmentManagerHistory(departmentId: string) {
	return db
		.select({
			id: departmentManager.id,
			validFrom: departmentManager.validFrom,
			validTo: departmentManager.validTo,
			reason: departmentManager.reason,
			staffId: staff.id,
			employeeNo: staff.employeeNo,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			active: staff.active
		})
		.from(departmentManager)
		.innerJoin(staff, eq(staff.id, departmentManager.staffId))
		.where(eq(departmentManager.departmentId, departmentId))
		.orderBy(desc(departmentManager.validFrom));
}

/** Every department's manager history with names and reasons, newest first. */
export async function listAllDepartmentManagerHistory() {
	return db
		.select({
			id: departmentManager.id,
			departmentId: departmentManager.departmentId,
			validFrom: departmentManager.validFrom,
			validTo: departmentManager.validTo,
			reason: departmentManager.reason,
			staffId: staff.id,
			employeeNo: staff.employeeNo,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			active: staff.active
		})
		.from(departmentManager)
		.innerJoin(staff, eq(staff.id, departmentManager.staffId))
		.orderBy(desc(departmentManager.validFrom));
}

export type ManagerHistoryRow = Awaited<ReturnType<typeof listAllDepartmentManagerHistory>>[number];

/** Active staff who can be chosen as a manager. */
export async function listManagerCandidates() {
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
