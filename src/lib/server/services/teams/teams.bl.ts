import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { damascusDayRange } from '#lib/server/time.js';
import type { TeamInput } from '#lib/schemas/teams.schema.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import { findDepartment, listDepartmentRows } from '../departments/departments.crud.js';
import { closeTeamMemberships } from '../membership.js';
import { normalizeSlots } from '../slots.js';
import {
	listActiveSupervisors,
	listTeamPatternsOn,
	type PatternRow
} from '../roster/roster.crud.js';
import {
	countActiveMembers,
	countActiveMembersByTeam,
	findTeam,
	insertTeam,
	listTeams as listTeamRows,
	unassignTeamMembers,
	updateTeam,
	type TeamRow
} from './teams.crud.js';

export type TeamListItem = TeamRow & {
	/** `null` for a team made before departments were required. */
	department: { id: string; nameEn: string; nameAr: string } | null;
	memberCount: number;
	/** The pattern in force today, or `null` when the team has none. */
	pattern: Pick<PatternRow, 'type' | 'slots'> | null;
	supervisors: { staffId: string; fullName: string; fullNameAr: string | null }[];
};

async function requireTeam(id: string): Promise<TeamRow> {
	const row = await findTeam(id);
	if (!row) throw new NotFoundError(m.teams_error_not_found());
	return row;
}

/** A team belongs to one active department (D22). */
async function requireActiveDepartment(id: string): Promise<void> {
	const row = await findDepartment(id);
	if (!row?.active)
		throw new InvalidInputError('department_inactive', m.teams_error_department_inactive(), {
			field: 'departmentId'
		});
}

function duplicateName(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) !== '23505') return undefined;
	return new ConflictError('duplicate_name', m.teams_error_duplicate(), {
		field: 'nameEn',
		cause: error
	});
}

/** Teams with active member count, today's pattern and supervisors. */
export async function listTeams(actor: Actor, day?: string): Promise<TeamListItem[]> {
	requireActorPermission(actor, 'staff.write');
	const range = damascusDayRange(day);

	const [teams, members, patterns, supervisors, departments] = await Promise.all([
		listTeamRows(),
		countActiveMembersByTeam(),
		listTeamPatternsOn(range.day),
		listActiveSupervisors(),
		listDepartmentRows()
	]);
	const departmentById = new Map(
		departments.map(({ id, nameEn, nameAr }) => [id, { id, nameEn, nameAr }])
	);

	const memberByTeam = new Map(members.map((row) => [row.teamId, row.count]));
	const patternByTeam = new Map(
		patterns.map(({ teamId, type, slots }) => [teamId, { type, slots: normalizeSlots(slots) }])
	);

	return teams.map((row) => ({
		...row,
		department: row.departmentId ? (departmentById.get(row.departmentId) ?? null) : null,
		memberCount: memberByTeam.get(row.id) ?? 0,
		pattern: patternByTeam.get(row.id) ?? null,
		supervisors: supervisors
			.filter((s) => s.teamId === row.id)
			.map(({ staffId, fullName, fullNameAr }) => ({ staffId, fullName, fullNameAr }))
	}));
}

export async function createTeam(actor: Actor, input: TeamInput): Promise<TeamRow> {
	requireActorPermission(actor, 'staff.write');
	await requireActiveDepartment(input.departmentId);
	const id = randomUUID();

	try {
		await batch([
			insertTeam({ id, ...input }),
			auditInsert({
				actor: actor.user,
				action: 'team.create',
				entityType: 'team',
				entityId: id,
				after: input
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}

	return { id, ...input, active: true };
}

export async function renameTeam(actor: Actor, id: string, input: TeamInput): Promise<TeamRow> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireTeam(id);
	if (input.departmentId !== before.departmentId) await requireActiveDepartment(input.departmentId);

	try {
		await batch([
			updateTeam(id, input),
			auditInsert({
				actor: actor.user,
				action: 'team.rename',
				entityType: 'team',
				entityId: id,
				before: { nameEn: before.nameEn, nameAr: before.nameAr, departmentId: before.departmentId },
				after: input
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}

	return { ...before, ...input };
}

/**
 * Deactivating clears the team of its members. Never hard-deletes (CLAUDE.md §6.6).
 */
export async function setTeamActive(actor: Actor, id: string, active: boolean): Promise<TeamRow> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireTeam(id);
	if (before.active === active) return before;

	let memberCount = 0;
	if (!active) {
		memberCount = await countActiveMembers(id);
	}

	await batch([
		updateTeam(id, { active }),
		...(active ? [] : [unassignTeamMembers(id), closeTeamMemberships(id, new Date())]),
		auditInsert({
			actor: actor.user,
			action: active ? 'team.activate' : 'team.deactivate',
			entityType: 'team',
			entityId: id,
			before: { active: before.active },
			after: { active, membersUnassigned: active ? 0 : memberCount }
		})
	]);

	return { ...before, active };
}
