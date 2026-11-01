import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { planVersionChange } from '#lib/roster/versions.js';
import type { DepartmentManagerInput } from '#lib/schemas/management.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { ancestorChain, flattenTree } from '#lib/workforce/departments.js';
import {
	chainOf,
	departmentOf,
	gaps,
	managerOn,
	momentOf,
	scopeOf,
	teamAt,
	type ChainStep,
	type Gap,
	type Org,
	type OrgMoment,
	type Scope
} from '#lib/workforce/management.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import {
	closeDepartmentManager,
	deleteDepartmentManagers,
	findDepartmentForManager,
	findStaffForManager,
	insertDepartmentManager,
	listAllDepartmentManagerHistory,
	listDepartmentManagerHistory,
	listManagerCandidates,
	listDepartmentManagerRows,
	loadOrgRows,
	type DepartmentManagerRow,
	type ManagerHistoryRow,
	type OrgRows
} from './management.crud.js';

// Two-level management (plans/2026-11-01-two-level-management.md, task 3.2): the tree with
// managers, supervisors and gaps; a person's chain and scope; changing a manager from a date.
// Viewing and changing need `staff.write` (M12). Supervisors keep their own team service.

export type ManagementPerson = {
	staffId: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	active: boolean;
};

export type ManagementTeam = {
	id: string;
	nameEn: string;
	nameAr: string;
	active: boolean;
	supervisors: ManagementPerson[];
	/** Active members on the date. */
	memberCount: number;
};

export type ManagementDepartment = {
	id: string;
	nameEn: string;
	nameAr: string;
	parentId: string | null;
	active: boolean;
	depth: number;
	/** The department's own manager on the date (also when inactive: that is a gap). */
	manager: (ManagementPerson & { validFrom: string; validTo: string | null }) | null;
	/** Without an own active manager: the nearest active manager above (M2, M24). */
	coveredBy: (ManagementPerson & { departmentId: string }) | null;
	/** Active people working directly in this department on the date (not its sub-departments). */
	peopleCount: number;
	teams: ManagementTeam[];
};

/** A gap (M8) with the person it is about, when there is one. */
export type ManagementGap = Gap & { person: ManagementPerson | null };

export type ManagementTree = {
	date: string;
	departments: ManagementDepartment[];
	/** Teams without a department (made before the builder plan). */
	unplacedTeams: ManagementTeam[];
	gaps: ManagementGap[];
};

export type ManagementChainStep = ChainStep & { person: ManagementPerson | null };

/**
 * The moment a date is read at (M23): 00:00 Damascus for any date, except today, which is read
 * now, so a supervisor added or a person moved this morning counts at once.
 */
function momentFor(date: string): OrgMoment {
	return date === todayInDamascus() ? momentOf(date, new Date()) : momentOf(date);
}

const isoDate = z.iso.date();

function requireDate(date: string): void {
	if (!isoDate.safeParse(date).success)
		throw new InvalidInputError('invalid_date', m.roster_date_invalid(), { field: 'date' });
}

async function loadOrg(): Promise<{ rows: OrgRows; org: Org }> {
	const rows = await loadOrgRows();
	return { rows, org: rows };
}

function personMap(rows: OrgRows): Map<string, ManagementPerson> {
	return new Map(
		rows.people.map(({ staffId, employeeNo, fullName, fullNameAr, active }) => [
			staffId,
			{ staffId, employeeNo, fullName, fullNameAr, active }
		])
	);
}

function gapPerson(gap: Gap, people: Map<string, ManagementPerson>): ManagementPerson | null {
	return 'staffId' in gap ? (people.get(gap.staffId) ?? null) : null;
}

/** The tree Department → manager → teams → supervisors, with counts and gaps, on `date` (M8). */
export async function getManagementTree(actor: Actor, date: string): Promise<ManagementTree> {
	requireActorPermission(actor, 'staff.write');
	requireDate(date);
	const { rows, org } = await loadOrg();
	const moment = momentFor(date);
	const people = personMap(rows);
	const active = new Set(rows.people.filter((p) => p.active).map((p) => p.staffId));

	const supervisorsOf = (teamId: string) =>
		rows.supervisors
			.filter(
				(s) =>
					s.teamId === teamId &&
					s.addedAt.getTime() <= moment.at.getTime() &&
					(s.removedAt === null || moment.at.getTime() < s.removedAt.getTime())
			)
			.flatMap((s) => {
				const person = people.get(s.staffId);
				return person ? [person] : [];
			})
			.sort((a, b) => a.fullName.localeCompare(b.fullName));

	const memberCounts = new Map<string, number>();
	const peopleCounts = new Map<string, number>();
	for (const person of rows.people) {
		if (!person.active) continue;
		const teamId = teamAt(org, person.staffId, moment.at);
		if (teamId) memberCounts.set(teamId, (memberCounts.get(teamId) ?? 0) + 1);
		const departmentId = departmentOf(org, person, moment);
		if (departmentId) peopleCounts.set(departmentId, (peopleCounts.get(departmentId) ?? 0) + 1);
	}

	const toTeam = (t: OrgRows['teams'][number]): ManagementTeam => ({
		id: t.id,
		nameEn: t.nameEn,
		nameAr: t.nameAr,
		active: t.active,
		supervisors: supervisorsOf(t.id),
		memberCount: memberCounts.get(t.id) ?? 0
	});

	const departments = flattenTree(rows.departments, (a, b) => a.nameEn.localeCompare(b.nameEn)).map(
		(d): ManagementDepartment => {
			const own = rows.managers.find(
				(v) =>
					v.departmentId === d.id && v.validFrom <= date && (v.validTo === null || v.validTo > date)
			);
			const ownPerson = own ? people.get(own.staffId) : undefined;
			const above =
				own && active.has(own.staffId)
					? null
					: managerOn(
							ancestorChain(rows.departments, d.id).slice(1),
							rows.managers,
							date,
							(id) => !active.has(id)
						);
			const abovePerson = above ? people.get(above.staffId) : undefined;
			return {
				id: d.id,
				nameEn: d.nameEn,
				nameAr: d.nameAr,
				parentId: d.parentId,
				active: d.active,
				depth: d.depth,
				manager:
					own && ownPerson
						? { ...ownPerson, validFrom: own.validFrom, validTo: own.validTo }
						: null,
				coveredBy:
					above && abovePerson ? { ...abovePerson, departmentId: above.departmentId } : null,
				peopleCount: peopleCounts.get(d.id) ?? 0,
				teams: rows.teams.filter((t) => t.departmentId === d.id).map(toTeam)
			};
		}
	);

	return {
		date,
		departments,
		unplacedTeams: rows.teams.filter((t) => t.departmentId === null).map(toTeam),
		gaps: gaps(org, moment).map((gap) => ({ ...gap, person: gapPerson(gap, people) }))
	};
}

/** Who is responsible for `staffId` on `date` (M5), with names. */
export async function chainFor(
	actor: Actor,
	staffId: string,
	date: string
): Promise<ManagementChainStep[]> {
	requireActorPermission(actor, 'staff.write');
	requireDate(date);
	const { rows, org } = await loadOrg();
	if (!rows.people.some((p) => p.staffId === staffId))
		throw new NotFoundError(m.staff_error_not_found());
	const people = personMap(rows);
	return chainOf(staffId, momentFor(date), org).map((step) => ({
		...step,
		person: 'staffId' in step ? (people.get(step.staffId) ?? null) : null
	}));
}

/** Whom `staffId` covers on `date` (M6): ids, for "view as" (M9) and later for sign-in (S8). */
export async function scopeFor(actor: Actor, staffId: string, date: string): Promise<Scope> {
	requireActorPermission(actor, 'staff.write');
	requireDate(date);
	const { rows, org } = await loadOrg();
	if (!rows.people.some((p) => p.staffId === staffId))
		throw new NotFoundError(m.staff_error_not_found());
	return scopeOf(staffId, momentFor(date), org);
}

/** What HR should fix on `date` (M8), with the person each gap is about. */
export async function listGaps(actor: Actor, date: string): Promise<ManagementGap[]> {
	requireActorPermission(actor, 'staff.write');
	requireDate(date);
	const { rows, org } = await loadOrg();
	const people = personMap(rows);
	return gaps(org, momentFor(date)).map((gap) => ({ ...gap, person: gapPerson(gap, people) }));
}

/** A department's managers, newest first, for the change-manager sheet (task 4.2). */
export async function listManagerHistory(actor: Actor, departmentId: string) {
	requireActorPermission(actor, 'staff.write');
	if (!(await findDepartmentForManager(departmentId)))
		throw new NotFoundError(m.departments_error_not_found());
	return listDepartmentManagerHistory(departmentId);
}

/** Every department's managers, newest first, keyed by department (for the sheet, M3). */
export async function listManagerHistories(
	actor: Actor
): Promise<Record<string, ManagerHistoryRow[]>> {
	requireActorPermission(actor, 'staff.write');
	const out: Record<string, ManagerHistoryRow[]> = {};
	for (const row of await listAllDepartmentManagerHistory()) {
		(out[row.departmentId] ??= []).push(row);
	}
	return out;
}

/** Active employees who can be chosen as a department's manager. */
export async function listManagerOptions(actor: Actor) {
	requireActorPermission(actor, 'staff.write');
	return listManagerCandidates();
}

/** The manager row in force on `date`, if any. */
export function managerRowOn(
	rows: readonly DepartmentManagerRow[],
	date: string
): DepartmentManagerRow | undefined {
	return rows.find((row) => row.validFrom <= date && (row.validTo === null || row.validTo > date));
}

/**
 * The writes that make `staffId` (or nobody) a department's manager from `from` (M3), with the
 * rule of every dated version here (`planVersionChange`): the row in force on `from` ends there,
 * rows starting on or after `from` are replaced. Removals and the close come first (for the
 * `EXCLUDE`), then the new row and the audit. Shared with the department form (M13).
 */
export function managerChange(
	actor: Actor,
	departmentId: string,
	rows: readonly DepartmentManagerRow[],
	staffId: string | null,
	from: string,
	reason: string
): BatchQuery[] {
	const { closed, removed } = planVersionChange(
		rows.map((row) => ({ ...row, effectiveFrom: row.validFrom, effectiveTo: row.validTo })),
		from
	);
	const opened = staffId
		? {
				id: randomUUID(),
				departmentId,
				staffId,
				validFrom: from,
				validTo: null,
				reason,
				createdBy: actor.user.id
			}
		: null;
	return [
		...(removed.length > 0 ? [deleteDepartmentManagers(removed.map((row) => row.id))] : []),
		...(closed ? [closeDepartmentManager(closed.id, from)] : []),
		...(opened ? [insertDepartmentManager(opened)] : []),
		auditInsert({
			actor: actor.user,
			action: 'department.manager.set',
			entityType: 'department',
			entityId: departmentId,
			before: { closed: closed?.id ?? null, removed: removed.map((row) => row.id) },
			after: opened ?? { staffId: null, validFrom: from },
			reason
		})
	];
}

/** An `EXCLUDE` clash: another manager change was saved for the department at the same time. */
export function managerConflict(error: unknown, field = 'staffId'): ConflictError | undefined {
	if (pgErrorCode(error) !== '23P01') return undefined;
	return new ConflictError('manager_overlap', m.departments_error_manager_overlap(), {
		field,
		cause: error
	});
}

/**
 * `staffId` (or nobody) manages the department from `validFrom` (M3): today or later until payroll
 * periods exist (Q-M5); an active department and an active employee; refused when nothing would
 * change. Audited with the reason.
 */
export async function setDepartmentManager(
	actor: Actor,
	input: DepartmentManagerInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	requireDate(input.validFrom);
	if (input.validFrom < todayInDamascus())
		throw new InvalidInputError('effective_past', m.roster_error_effective_past(), {
			field: 'validFrom'
		});

	const department = await findDepartmentForManager(input.departmentId);
	if (!department) throw new NotFoundError(m.departments_error_not_found());
	if (!department.active)
		throw new InvalidInputError('department_inactive', m.management_error_department_inactive(), {
			field: 'departmentId'
		});
	if (input.staffId) {
		const person = await findStaffForManager(input.staffId);
		if (!person?.active)
			throw new InvalidInputError('invalid_manager', m.departments_error_manager(), {
				field: 'staffId'
			});
	}

	const rows = await listDepartmentManagerRows(input.departmentId);
	const current = managerRowOn(rows, input.validFrom)?.staffId ?? null;
	const later = rows.some((row) => row.validFrom > input.validFrom);
	if (current === input.staffId && !later)
		throw new InvalidInputError('manager_unchanged', m.management_error_unchanged(), {
			field: 'staffId'
		});

	try {
		await batch(
			managerChange(actor, input.departmentId, rows, input.staffId, input.validFrom, input.reason)
		);
	} catch (error) {
		throw managerConflict(error) ?? error;
	}
}
