import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import type { DepartmentInput } from '#lib/schemas/departments.schema.js';
import { flattenTree, wouldCreateCycle } from '#lib/workforce/departments.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import {
	countActiveStaffByDepartment,
	findActiveStaff,
	findDepartment,
	insertDepartment,
	listActiveStaffOptions,
	listDepartmentRows,
	listManagers,
	updateDepartment,
	type DepartmentRow,
	type StaffOption
} from './departments.crud.js';

export type DepartmentListItem = DepartmentRow & {
	depth: number;
	staffCount: number;
	activeChildCount: number;
	manager: { fullName: string; fullNameAr: string | null } | null;
};

/** The whole tree, parents before children, with counts and manager names. */
export async function listDepartments(actor: Actor): Promise<DepartmentListItem[]> {
	requireActorPermission(actor, 'staff.write');
	const [rows, staffCounts, managers] = await Promise.all([
		listDepartmentRows(),
		countActiveStaffByDepartment(),
		listManagers()
	]);
	const staffBy = new Map(staffCounts.map((row) => [row.departmentId, row.count]));
	const managerBy = new Map(managers.map((row) => [row.id, row]));
	const activeChildren = new Map<string, number>();
	for (const row of rows) {
		if (row.parentId && row.active)
			activeChildren.set(row.parentId, (activeChildren.get(row.parentId) ?? 0) + 1);
	}

	return flattenTree(rows, (a, b) => a.nameEn.localeCompare(b.nameEn)).map((row) => {
		const manager = row.managerStaffId ? managerBy.get(row.managerStaffId) : undefined;
		return {
			...row,
			staffCount: staffBy.get(row.id) ?? 0,
			activeChildCount: activeChildren.get(row.id) ?? 0,
			manager: manager ? { fullName: manager.fullName, fullNameAr: manager.fullNameAr } : null
		};
	});
}

export async function listManagerOptions(actor: Actor): Promise<StaffOption[]> {
	requireActorPermission(actor, 'staff.write');
	return listActiveStaffOptions();
}

async function requireDepartment(id: string): Promise<DepartmentRow> {
	const row = await findDepartment(id);
	if (!row) throw new NotFoundError(m.departments_error_not_found());
	return row;
}

/** Parent must exist, be active and not create a cycle; the manager must be an active employee. */
async function validateInput(id: string | null, input: DepartmentInput): Promise<void> {
	if (input.parentId) {
		const parent = await findDepartment(input.parentId);
		if (!parent || !parent.active) {
			throw new InvalidInputError('invalid_parent', m.departments_error_parent_inactive(), {
				field: 'parentId'
			});
		}
		if (id && wouldCreateCycle(await listDepartmentRows(), id, input.parentId)) {
			throw new InvalidInputError('department_cycle', m.departments_error_cycle(), {
				field: 'parentId'
			});
		}
	}
	if (input.managerStaffId && !(await findActiveStaff(input.managerStaffId))) {
		throw new InvalidInputError('invalid_manager', m.departments_error_manager(), {
			field: 'managerStaffId'
		});
	}
}

function duplicateName(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) !== '23505') return undefined;
	return new ConflictError('duplicate_name', m.departments_error_duplicate(), {
		field: 'nameEn',
		cause: error
	});
}

export async function createDepartment(actor: Actor, input: DepartmentInput): Promise<DepartmentRow> {
	requireActorPermission(actor, 'staff.write');
	await validateInput(null, input);
	const id = randomUUID();

	try {
		await batch([
			insertDepartment({ id, ...input }),
			auditInsert({
				actor: actor.user,
				action: 'department.create',
				entityType: 'department',
				entityId: id,
				after: input
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}

	return { id, ...input, active: true };
}

export async function editDepartment(
	actor: Actor,
	id: string,
	input: DepartmentInput
): Promise<DepartmentRow> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireDepartment(id);
	await validateInput(id, input);

	try {
		await batch([
			updateDepartment(id, input),
			auditInsert({
				actor: actor.user,
				action: 'department.update',
				entityType: 'department',
				entityId: id,
				before: {
					nameEn: before.nameEn,
					nameAr: before.nameAr,
					parentId: before.parentId,
					managerStaffId: before.managerStaffId
				},
				after: input
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}

	return { ...before, ...input };
}

/**
 * Deactivating is refused while active employees or active sub-departments remain (move them
 * first); reactivating is refused under an inactive parent. Never hard-deletes.
 */
export async function setDepartmentActive(
	actor: Actor,
	id: string,
	active: boolean
): Promise<DepartmentRow> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireDepartment(id);
	if (before.active === active) return before;

	if (active && before.parentId) {
		const parent = await findDepartment(before.parentId);
		if (!parent?.active)
			throw new ConflictError('parent_inactive', m.departments_error_parent_inactive());
	}
	if (!active) {
		const [rows, staffCounts] = await Promise.all([
			listDepartmentRows(),
			countActiveStaffByDepartment()
		]);
		if ((staffCounts.find((row) => row.departmentId === id)?.count ?? 0) > 0)
			throw new ConflictError('has_staff', m.departments_error_has_staff());
		if (rows.some((row) => row.parentId === id && row.active))
			throw new ConflictError('has_children', m.departments_error_has_children());
	}

	await batch([
		updateDepartment(id, { active }),
		auditInsert({
			actor: actor.user,
			action: active ? 'department.activate' : 'department.deactivate',
			entityType: 'department',
			entityId: id,
			before: { active: before.active },
			after: { active }
		})
	]);

	return { ...before, active };
}
