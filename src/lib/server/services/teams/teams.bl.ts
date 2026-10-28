import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { db } from '#lib/server/db/index.js';
import { ConflictError, NotFoundError } from '#lib/server/errors.js';
import { damascusDayRange } from '#lib/server/time.js';
import type { ShiftKind } from '#lib/schemas/enums.js';
import type { TeamInput } from '#lib/schemas/teams.schema.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import { closeTeamMemberships } from '../membership.js';
import { listActiveSupervisors, listTeamPatternsOn } from '../roster/roster.crud.js';
import {
	countActiveMembers,
	countActiveMembersByTeam,
	countFlightsByTeam,
	countFutureAssignments,
	findTeam,
	insertTeam,
	listTeams as listTeamRows,
	unassignTeamMembers,
	updateTeam,
	type TeamRow
} from './teams.crud.js';

export type TeamListItem = TeamRow & {
	memberCount: number;
	todayFlights: number;
	/** The cycle in force today, or `null` when the team has none. */
	cycle: ShiftKind[] | null;
	supervisors: { staffId: string; fullName: string; fullNameAr: string | null }[];
};

async function requireTeam(id: string): Promise<TeamRow> {
	const row = await findTeam(id);
	if (!row) throw new NotFoundError(m.teams_error_not_found());
	return row;
}

function duplicateName(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) !== '23505') return undefined;
	return new ConflictError('duplicate_name', m.teams_error_duplicate(), {
		field: 'nameEn',
		cause: error
	});
}

/** Teams with active member count, flights today, today's cycle and supervisors (Damascus). */
export async function listTeams(actor: Actor, day?: string): Promise<TeamListItem[]> {
	requireActorPermission(actor, 'staff.write');
	const range = damascusDayRange(day);

	const [teams, members, flights, patterns, supervisors] = await Promise.all([
		listTeamRows(),
		countActiveMembersByTeam(),
		countFlightsByTeam(range.start, range.end),
		listTeamPatternsOn(range.day),
		listActiveSupervisors()
	]);

	const memberByTeam = new Map(members.map((row) => [row.teamId, row.count]));
	const flightByTeam = new Map(flights.map((row) => [row.teamId, row.count]));
	const cycleByTeam = new Map(patterns.map((row) => [row.teamId, row.cycle]));

	return teams.map((row) => ({
		...row,
		memberCount: memberByTeam.get(row.id) ?? 0,
		todayFlights: flightByTeam.get(row.id) ?? 0,
		cycle: cycleByTeam.get(row.id) ?? null,
		supervisors: supervisors
			.filter((s) => s.teamId === row.id)
			.map(({ staffId, fullName, fullNameAr }) => ({ staffId, fullName, fullNameAr }))
	}));
}

export async function createTeam(actor: Actor, input: TeamInput): Promise<TeamRow> {
	requireActorPermission(actor, 'staff.write');
	const id = randomUUID();

	try {
		await db.batch([
			insertTeam({ id, nameEn: input.nameEn, nameAr: input.nameAr }),
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

	try {
		await db.batch([
			updateTeam(id, input),
			auditInsert({
				actor: actor.user,
				action: 'team.rename',
				entityType: 'team',
				entityId: id,
				before: { nameEn: before.nameEn, nameAr: before.nameAr },
				after: input
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}

	return { ...before, ...input };
}

/**
 * Deactivating is blocked while the team still has a future active assignment, and clears the
 * team of its members. Never hard-deletes (CLAUDE.md §6.6).
 */
export async function setTeamActive(actor: Actor, id: string, active: boolean): Promise<TeamRow> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireTeam(id);
	if (before.active === active) return before;

	let memberCount = 0;
	if (!active) {
		if ((await countFutureAssignments(id, new Date())) > 0) {
			throw new ConflictError('has_future_assignments', m.teams_error_future_assignments());
		}
		memberCount = await countActiveMembers(id);
	}

	await db.batch([
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
