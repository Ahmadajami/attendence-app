import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch, db } from '#lib/server/db/index.js';
import {
	ConflictError,
	ForbiddenError,
	InvalidInputError,
	NotFoundError
} from '#lib/server/errors.js';
import { department, jobTitle, staff, staffFunction, team } from '#lib/server/db/schema/index.js';
import { nextEmployeeNo } from '#lib/workforce/employee-no.js';
import { resolveNames, type NameParts } from '#lib/workforce/profile.js';
import type {
	DepartmentOption,
	JobTitleOption,
	StaffRow,
	StaffFunctionOption,
	TeamOption
} from '#lib/types/workforce.js';
import { pgErrorCode, type Actor } from './common.js';
import { membershipChange } from './membership.js';
import { validateJobTitle } from './staff-profile/staff-profile.bl.js';

export type StaffInput = NameParts & {
	/** `null` on create = generate the next number (plan D28). */
	employeeNo: string | null;
	/** Used when the English name parts are empty (a person without parts, profile plan H1). */
	fullName: string | null;
	fullNameAr: string | null;
	jobTitleId: string | null;
	phone: string | null;
	functionId: string | null;
	departmentId: string | null;
	workEmail: string | null;
	startDate: string | null;
	teamId: string | null;
};

/** Retries when a concurrent create took the generated number first. */
const GENERATED_NUMBER_ATTEMPTS = 3;

const staffRelations = {
	function: { columns: { id: true, key: true, nameEn: true, nameAr: true } },
	department: { columns: { id: true, nameEn: true, nameAr: true, active: true } },
	team: { columns: { id: true, nameEn: true, nameAr: true, active: true } },
	jobTitle: { columns: { id: true, nameEn: true, nameAr: true, active: true } }
} as const;

function requireStaffWrite(actor: Actor) {
	if (!actor.permissions.has('staff.write')) throw new ForbiddenError();
}

async function findStaff(id: string) {
	const row = await db.query.staff.findFirst({
		where: eq(staff.id, id),
		with: staffRelations
	});
	if (!row) throw new NotFoundError(m.staff_error_not_found());
	return row;
}

async function validateLookups(input: {
	functionId: string | null;
	departmentId: string | null;
	teamId: string | null;
}) {
	if (input.functionId) {
		const fn = await db.query.staffFunction.findFirst({
			where: eq(staffFunction.id, input.functionId),
			columns: { id: true }
		});
		if (!fn)
			throw new InvalidInputError('invalid_function', m.staff_error_function(), {
				field: 'functionId'
			});
	}

	if (input.departmentId) {
		const dept = await db.query.department.findFirst({
			where: eq(department.id, input.departmentId),
			columns: { id: true, active: true }
		});
		if (!dept || !dept.active)
			throw new InvalidInputError('invalid_department', m.staff_error_department(), {
				field: 'departmentId'
			});
	}

	if (!input.teamId) return;
	const row = await db.query.team.findFirst({
		where: eq(team.id, input.teamId),
		columns: { id: true, active: true }
	});
	if (!row || !row.active)
		throw new InvalidInputError('invalid_team', m.staff_error_team(), { field: 'teamId' });
}

/**
 * The stored names (H1): both parts of a language give "first last", none keeps the posted full
 * name. A new person needs the English parts; an existing one at least a full name.
 */
function storedNames(input: StaffInput, creating: boolean) {
	const names = resolveNames(input, input);
	if (!names.ok)
		throw new InvalidInputError('name_part_missing', m.profile_name_part_missing(), {
			field: names.field
		});
	if (!names.fullName)
		throw new InvalidInputError('name_missing', m.staff_name_required(), {
			field: creating ? 'firstNameEn' : 'fullName'
		});
	return { ...names.parts, fullName: names.fullName, fullNameAr: names.fullNameAr };
}

/** All staff, including deactivated, newest changes last. */
export async function listStaff(actor: Actor): Promise<StaffRow[]> {
	requireStaffWrite(actor);
	const rows = await db.query.staff.findMany({
		columns: {
			id: true,
			employeeNo: true,
			fullName: true,
			fullNameAr: true,
			firstNameEn: true,
			lastNameEn: true,
			firstNameAr: true,
			lastNameAr: true,
			phone: true,
			workEmail: true,
			startDate: true,
			active: true
		},
		with: staffRelations,
		orderBy: [asc(staff.fullName)]
	});
	return rows;
}

export async function listFunctions(actor: Actor): Promise<StaffFunctionOption[]> {
	requireStaffWrite(actor);
	return db
		.select({
			id: staffFunction.id,
			key: staffFunction.key,
			nameEn: staffFunction.nameEn,
			nameAr: staffFunction.nameAr
		})
		.from(staffFunction)
		.orderBy(asc(staffFunction.nameEn));
}

export async function listActiveDepartments(actor: Actor): Promise<DepartmentOption[]> {
	requireStaffWrite(actor);
	return db
		.select({
			id: department.id,
			nameEn: department.nameEn,
			nameAr: department.nameAr,
			active: department.active
		})
		.from(department)
		.where(eq(department.active, true))
		.orderBy(asc(department.nameEn));
}

/** Active job titles for the create / edit sheet (an inactive one a person has still shows). */
export async function listJobTitleOptions(actor: Actor): Promise<JobTitleOption[]> {
	requireStaffWrite(actor);
	return db
		.select({
			id: jobTitle.id,
			nameEn: jobTitle.nameEn,
			nameAr: jobTitle.nameAr,
			active: jobTitle.active
		})
		.from(jobTitle)
		.where(eq(jobTitle.active, true))
		.orderBy(asc(jobTitle.nameEn));
}

export async function listActiveTeams(actor: Actor): Promise<TeamOption[]> {
	requireStaffWrite(actor);
	return db
		.select({
			id: team.id,
			nameEn: team.nameEn,
			nameAr: team.nameAr,
			active: team.active
		})
		.from(team)
		.where(eq(team.active, true))
		.orderBy(asc(team.nameEn));
}

/** Every number ever used (active or not), so a generated one is never reused. */
async function allEmployeeNumbers(): Promise<string[]> {
	const rows = await db.select({ employeeNo: staff.employeeNo }).from(staff);
	return rows.map((row) => row.employeeNo);
}

export async function createStaff(actor: Actor, input: StaffInput) {
	requireStaffWrite(actor);
	const names = storedNames(input, true);
	await validateLookups(input);
	await validateJobTitle(input.jobTitleId, null);
	const generate = input.employeeNo === null;

	for (let attempt = 1; ; attempt++) {
		const id = randomUUID();
		const employeeNo = input.employeeNo ?? nextEmployeeNo(await allEmployeeNumbers());
		const values = { ...input, ...names, employeeNo };
		try {
			await batch([
				db.insert(staff).values({ id, ...values }),
				...membershipChange(id, null, input.teamId, new Date()),
				auditInsert({
					actor: actor.user,
					action: 'staff.create',
					entityType: 'staff',
					entityId: id,
					after: { ...values, generatedEmployeeNo: generate }
				})
			]);
			return findStaff(id);
		} catch (error) {
			if (pgErrorCode(error) !== '23505') throw error;
			if (generate && attempt < GENERATED_NUMBER_ATTEMPTS) continue;
			throw new ConflictError('duplicate_employee_no', m.staff_error_duplicate(), {
				field: 'employeeNo',
				cause: error
			});
		}
	}
}

export async function updateStaff(actor: Actor, id: string, input: StaffInput) {
	requireStaffWrite(actor);
	const before = await findStaff(id);
	const names = storedNames(input, false);
	await validateLookups(input);
	await validateJobTitle(input.jobTitleId, before.jobTitleId);
	// Editing never generates: an empty number keeps the current one.
	const values = { ...input, ...names, employeeNo: input.employeeNo ?? before.employeeNo };

	try {
		await batch([
			db.update(staff).set(values).where(eq(staff.id, id)),
			...membershipChange(id, before.team?.id ?? null, input.teamId, new Date()),
			auditInsert({
				actor: actor.user,
				action: 'staff.update',
				entityType: 'staff',
				entityId: id,
				before: {
					employeeNo: before.employeeNo,
					fullName: before.fullName,
					fullNameAr: before.fullNameAr,
					firstNameEn: before.firstNameEn,
					lastNameEn: before.lastNameEn,
					firstNameAr: before.firstNameAr,
					lastNameAr: before.lastNameAr,
					jobTitleId: before.jobTitleId,
					phone: before.phone,
					functionId: before.function?.id ?? null,
					departmentId: before.department?.id ?? null,
					workEmail: before.workEmail,
					startDate: before.startDate,
					teamId: before.team?.id ?? null
				},
				after: values
			})
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('duplicate_employee_no', m.staff_error_duplicate(), {
				field: 'employeeNo',
				cause: error
			});
		throw error;
	}

	return findStaff(id);
}

/** Move a staff member into a team, or out of every team with `null`. */
export async function setStaffTeam(actor: Actor, id: string, teamId: string | null) {
	requireStaffWrite(actor);
	const before = await findStaff(id);
	if ((before.team?.id ?? null) === teamId) return before;
	await validateLookups({ functionId: null, departmentId: null, teamId });

	await batch([
		db.update(staff).set({ teamId }).where(eq(staff.id, id)),
		...membershipChange(id, before.team?.id ?? null, teamId, new Date()),
		auditInsert({
			actor: actor.user,
			action: 'staff.set_team',
			entityType: 'staff',
			entityId: id,
			before: { teamId: before.team?.id ?? null },
			after: { teamId }
		})
	]);

	return findStaff(id);
}

export async function setStaffActive(actor: Actor, id: string, active: boolean) {
	requireStaffWrite(actor);
	const before = await findStaff(id);
	if (before.active === active) return before;

	await batch([
		db
			.update(staff)
			.set({ active, ...(active ? {} : { teamId: null }) })
			.where(eq(staff.id, id)),
		...(active ? [] : membershipChange(id, before.team?.id ?? null, null, new Date())),
		auditInsert({
			actor: actor.user,
			action: active ? 'staff.activate' : 'staff.deactivate',
			entityType: 'staff',
			entityId: id,
			before: { active: before.active, teamId: before.team?.id ?? null },
			after: { active, teamId: active ? (before.team?.id ?? null) : null }
		})
	]);

	return findStaff(id);
}
