import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import type { DepartmentInput } from '#lib/schemas/departments.schema.js';
import { todayInDamascus } from '#lib/server/time.js';
import { flattenTree, wouldCreateCycle } from '#lib/workforce/departments.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import { listDepartmentManagerRows } from '../management/management.crud.js';
import { managerChange, managerConflict, managerRowOn } from '../management/management.bl.js';
import {
	countActiveStaffByDepartment,
	findActiveStaff,
	findDepartment,
	insertDepartment,
	listActiveStaffOptions,
	listDepartmentRows,
	listManagersOn,
	updateDepartment,
	type DepartmentRow,
	type StaffOption
} from './departments.crud.js';

/**
 * Stored as the reason of manager rows set from the department form, which has no reason field
 * (management plan task 1.3). The dated "change manager" sheet (task 4.2) asks HR for one.
 */
const DEPARTMENT_FORM_REASON = 'Set on the departments page';

export type DepartmentListItem = DepartmentRow & {
	depth: number;
	staffCount: number;
	activeChildCount: number;
	/** The department's own manager today (`department_manager`, M3); `null` when it has none. */
	managerStaffId: string | null;
	manager: { fullName: string; fullNameAr: string | null } | null;
};

/** The whole tree, parents before children, with counts and today's manager names. */
export async function listDepartments(actor: Actor): Promise<DepartmentListItem[]> {
	requireActorPermission(actor, 'staff.write');
	const [rows, staffCounts, managers] = await Promise.all([
		listDepartmentRows(),
		countActiveStaffByDepartment(),
		listManagersOn(todayInDamascus())
	]);
	const staffBy = new Map(staffCounts.map((row) => [row.departmentId, row.count]));
	const managerBy = new Map(managers.map((row) => [row.departmentId, row]));
	const activeChildren = new Map<string, number>();
	for (const row of rows) {
		if (row.parentId && row.active)
			activeChildren.set(row.parentId, (activeChildren.get(row.parentId) ?? 0) + 1);
	}

	return flattenTree(rows, (a, b) => a.nameEn.localeCompare(b.nameEn)).map((row) => {
		const manager = managerBy.get(row.id);
		return {
			...row,
			staffCount: staffBy.get(row.id) ?? 0,
			activeChildCount: activeChildren.get(row.id) ?? 0,
			managerStaffId: manager?.staffId ?? null,
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

/** Parent must exist, be active and not create a cycle. */
async function validateParent(id: string | null, input: DepartmentInput): Promise<void> {
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
}

/** A new manager must be an active employee (checked only when the manager changes). */
async function validateManager(staffId: string | null): Promise<void> {
	if (staffId && !(await findActiveStaff(staffId))) {
		throw new InvalidInputError('invalid_manager', m.departments_error_manager(), {
			field: 'managerStaffId'
		});
	}
}

/** A duplicate sibling name, or a manager row saved over another at the same time. */
function conflictOf(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) === '23505')
		return new ConflictError('duplicate_name', m.departments_error_duplicate(), {
			field: 'nameEn',
			cause: error
		});
	return managerConflict(error, 'managerStaffId');
}

/** A new department; its manager, if any, from today (M3). */
export async function createDepartment(
	actor: Actor,
	input: DepartmentInput
): Promise<DepartmentRow> {
	requireActorPermission(actor, 'staff.write');
	await validateParent(null, input);
	await validateManager(input.managerStaffId);
	const id = randomUUID();
	const values = { nameEn: input.nameEn, nameAr: input.nameAr, parentId: input.parentId };

	try {
		await batch([
			insertDepartment({ id, ...values }),
			auditInsert({
				actor: actor.user,
				action: 'department.create',
				entityType: 'department',
				entityId: id,
				after: input
			}),
			...(input.managerStaffId
				? managerChange(
						actor,
						id,
						[],
						input.managerStaffId,
						todayInDamascus(),
						DEPARTMENT_FORM_REASON
					)
				: [])
		]);
	} catch (error) {
		throw conflictOf(error) ?? error;
	}

	return { id, ...values, active: true };
}

/**
 * Name, parent and manager. A different manager takes over from today: the old one's row ends
 * today and stays in the history (M3); a row that started today is replaced.
 */
export async function editDepartment(
	actor: Actor,
	id: string,
	input: DepartmentInput
): Promise<DepartmentRow> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireDepartment(id);
	await validateParent(id, input);
	const today = todayInDamascus();
	const managerRows = await listDepartmentManagerRows(id);
	const managerBefore = managerRowOn(managerRows, today)?.staffId ?? null;
	const managerChanged = input.managerStaffId !== managerBefore;
	if (managerChanged) await validateManager(input.managerStaffId);
	const values = { nameEn: input.nameEn, nameAr: input.nameAr, parentId: input.parentId };

	try {
		await batch([
			updateDepartment(id, values),
			auditInsert({
				actor: actor.user,
				action: 'department.update',
				entityType: 'department',
				entityId: id,
				before: {
					nameEn: before.nameEn,
					nameAr: before.nameAr,
					parentId: before.parentId,
					managerStaffId: managerBefore
				},
				after: input
			}),
			...(managerChanged
				? managerChange(actor, id, managerRows, input.managerStaffId, today, DEPARTMENT_FORM_REASON)
				: [])
		]);
	} catch (error) {
		throw conflictOf(error) ?? error;
	}

	return { ...before, ...values };
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
