import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { db } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { damascusDayRange, todayInDamascus } from '#lib/server/time.js';
import { addDays, startOfDamascusDay } from '#lib/roster/cycle.js';
import { planVersionChange } from '#lib/roster/versions.js';
import type { EndPatternInput, PatternInput } from '#lib/schemas/roster.schema.js';
import type { ShiftStarts } from '#lib/schemas/settings.schema.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { loadShiftStarts } from '../settings/settings.bl.js';
import { findTeam, listTeams as listTeamRows, type TeamRow } from '../teams/teams.crud.js';
import type { ShiftKind } from '#lib/schemas/enums.js';
import {
	closePattern,
	deletePatterns,
	findActiveSupervisor,
	findRosterPerson,
	insertPattern,
	insertSupervisor,
	listAbsencesBetween,
	listActiveStaffOptions,
	listMembershipsBetween,
	listOverridesBetween,
	listPersonalPatterns,
	listStaffWithPersonalPattern,
	listTeamMembersBetween,
	listTeamPatterns,
	listTeamPatternsOn,
	listTeamSupervisors,
	removeSupervisor,
	type AbsenceRow,
	type MembershipRow,
	type OverrideRow,
	type PatternRow,
	type RosterPersonRow,
	type StaffOption,
	type SupervisorRow,
	type TeamMemberRow
} from './roster.crud.js';

/** Length of the roster preview, in days. */
export const PREVIEW_DAYS = 28;

/** What the browser needs to compute a roster preview with `#lib/roster` (live, no round trip). */
export type RosterPreviewData = {
	from: string;
	days: number;
	memberships: MembershipRow[];
	teamPatterns: PatternRow[];
	personalPatterns: PatternRow[];
	overrides: OverrideRow[];
	absences: AbsenceRow[];
};

/** A team's cycle in force today, offered as a starting point in the cycle editor. */
export type CycleSource = Pick<TeamRow, 'id' | 'nameEn' | 'nameAr'> & { cycle: ShiftKind[] };

export type TeamRoster = {
	team: TeamRow;
	today: string;
	canManage: boolean;
	shiftStarts: ShiftStarts | null;
	versions: PatternRow[];
	supervisors: SupervisorRow[];
	members: TeamMemberRow[];
	staffOptions: StaffOption[];
	cycleSources: CycleSource[];
	preview: RosterPreviewData;
};

export type PersonRoster = {
	person: RosterPersonRow;
	today: string;
	canManage: boolean;
	shiftStarts: ShiftStarts | null;
	versions: PatternRow[];
	cycleSources: CycleSource[];
	preview: RosterPreviewData;
};

async function listCycleSources(today: string): Promise<CycleSource[]> {
	const [teams, patterns] = await Promise.all([listTeamRows(), listTeamPatternsOn(today)]);
	return teams.flatMap(({ id, nameEn, nameAr }) => {
		const pattern = patterns.find((p) => p.teamId === id);
		return pattern ? [{ id, nameEn, nameAr, cycle: pattern.cycle }] : [];
	});
}

type Owner = { teamId: string; staffId?: never } | { staffId: string; teamId?: never };

async function loadPreview(
	staffIds: string[],
	from: string,
	extraTeamIds: string[] = []
): Promise<RosterPreviewData> {
	const last = addDays(from, PREVIEW_DAYS - 1);
	const start = startOfDamascusDay(from);
	const end = startOfDamascusDay(addDays(from, PREVIEW_DAYS));
	const [memberships, personalPatterns, overrides, absences] = await Promise.all([
		listMembershipsBetween(staffIds, start, end),
		listPersonalPatterns(staffIds),
		listOverridesBetween(staffIds, from, last),
		listAbsencesBetween(staffIds, from, last)
	]);
	const teamIds = [...new Set([...extraTeamIds, ...memberships.map((m) => m.teamId)])];
	return {
		from,
		days: PREVIEW_DAYS,
		memberships,
		teamPatterns: await listTeamPatterns(teamIds),
		personalPatterns,
		overrides,
		absences
	};
}

async function requireTeam(teamId: string): Promise<TeamRow> {
	const row = await findTeam(teamId);
	if (!row) throw new NotFoundError(m.teams_error_not_found());
	return row;
}

async function requirePerson(staffId: string): Promise<RosterPersonRow> {
	const row = await findRosterPerson(staffId);
	if (!row) throw new NotFoundError(m.staff_error_not_found());
	return row;
}

/** A team's members, supervisors, cycle history and the data for a 4-week preview from `from`. */
export async function getTeamRoster(
	actor: Actor,
	teamId: string,
	from: string | null
): Promise<TeamRoster> {
	requireActorPermission(actor, 'staff.write');
	const today = todayInDamascus();
	const start = damascusDayRange(from).day;
	const team = await requireTeam(teamId);
	const members = await listTeamMembersBetween(
		teamId,
		startOfDamascusDay(start),
		startOfDamascusDay(addDays(start, PREVIEW_DAYS))
	);
	const canManage = actor.permissions.has('roster.manage');
	const [versions, supervisors, staffOptions, shiftStarts, cycleSources, preview] =
		await Promise.all([
			listTeamPatterns([teamId]),
			listTeamSupervisors(teamId),
			canManage ? listActiveStaffOptions() : Promise.resolve([]),
			loadShiftStarts(),
			canManage ? listCycleSources(today) : Promise.resolve([]),
			loadPreview([...new Set(members.map((m) => m.staffId))], start, [teamId])
		]);
	return {
		team,
		today,
		canManage,
		shiftStarts,
		versions,
		supervisors,
		members,
		staffOptions,
		cycleSources: cycleSources.filter((s) => s.id !== teamId),
		preview
	};
}

/** One person's own cycle history and their 4-week preview from `from`. */
export async function getPersonRoster(
	actor: Actor,
	staffId: string,
	from: string | null
): Promise<PersonRoster> {
	requireActorPermission(actor, 'staff.write');
	const today = todayInDamascus();
	const start = damascusDayRange(from).day;
	const person = await requirePerson(staffId);
	const canManage = actor.permissions.has('roster.manage');
	const [shiftStarts, cycleSources, preview] = await Promise.all([
		loadShiftStarts(),
		canManage ? listCycleSources(today) : Promise.resolve([]),
		loadPreview([staffId], start)
	]);
	return {
		person,
		today,
		canManage,
		shiftStarts,
		versions: preview.personalPatterns,
		cycleSources,
		preview
	};
}

/** Ids of everyone following a personal cycle now or from a scheduled date. */
export async function listPersonalPatternStaff(actor: Actor): Promise<string[]> {
	requireActorPermission(actor, 'staff.write');
	return listStaffWithPersonalPattern(todayInDamascus());
}

function requireFutureDate(date: string, field: string) {
	if (date < todayInDamascus())
		throw new InvalidInputError('effective_past', m.roster_error_effective_past(), { field });
}

/**
 * Run a version change and its audit row in one batch; an overlap left by a concurrent save is a
 * 409. `changes` run in order (removals and the close before the insert, for the `EXCLUDE`).
 */
async function commitVersionChange(audit: BatchQuery, changes: BatchQuery[]): Promise<void> {
	try {
		await db.batch([audit, ...changes]);
	} catch (error) {
		if (pgErrorCode(error) === '23P01')
			throw new ConflictError('pattern_overlap', m.roster_error_overlap(), { cause: error });
		throw error;
	}
}

async function savePattern(
	actor: Actor,
	owner: Owner,
	versions: PatternRow[],
	input: PatternInput
): Promise<void> {
	requireFutureDate(input.effectiveFrom, 'effectiveFrom');
	const times = await loadShiftStarts();
	if (!times) throw new InvalidInputError('shift_times_unset', m.roster_error_times_unset());

	const { closed, removed } = planVersionChange(versions, input.effectiveFrom);
	const values = {
		id: randomUUID(),
		teamId: owner.teamId ?? null,
		staffId: owner.staffId ?? null,
		cycle: input.cycle,
		anchorDate: input.anchorDate,
		dayStart: times.day,
		nightStart: times.night,
		effectiveFrom: input.effectiveFrom,
		effectiveTo: null,
		reason: input.reason,
		createdBy: actor.user.id
	};
	await commitVersionChange(
		auditInsert({
			actor: actor.user,
			action: 'shift_pattern.set',
			entityType: owner.teamId ? 'team' : 'staff',
			entityId: owner.teamId ?? owner.staffId,
			before: { closed, removed },
			after: values,
			reason: input.reason
		}),
		[
			...(removed.length > 0 ? [deletePatterns(removed.map((v) => v.id))] : []),
			...(closed ? [closePattern(closed.id, input.effectiveFrom)] : []),
			insertPattern(values)
		]
	);
}

/** A team's new cycle from `effectiveFrom` (today or later). Earlier days keep their cycle. */
export async function setTeamPattern(
	actor: Actor,
	teamId: string,
	input: PatternInput
): Promise<TeamRow> {
	requireActorPermission(actor, 'roster.manage');
	const team = await requireTeam(teamId);
	await savePattern(actor, { teamId }, await listTeamPatterns([teamId]), input);
	return team;
}

/** A person's own cycle from `effectiveFrom`, overriding their team's. */
export async function setPersonalPattern(
	actor: Actor,
	staffId: string,
	input: PatternInput
): Promise<RosterPersonRow> {
	requireActorPermission(actor, 'roster.manage');
	const person = await requirePerson(staffId);
	await savePattern(actor, { staffId }, await listPersonalPatterns([staffId]), input);
	return person;
}

/** Stop a person's own cycle from `effectiveFrom`; from then they follow their team. */
export async function endPersonalPattern(
	actor: Actor,
	staffId: string,
	input: EndPatternInput
): Promise<RosterPersonRow> {
	requireActorPermission(actor, 'roster.manage');
	requireFutureDate(input.effectiveFrom, 'effectiveFrom');
	const person = await requirePerson(staffId);
	const { closed, removed } = planVersionChange(
		await listPersonalPatterns([staffId]),
		input.effectiveFrom
	);
	const changes = [
		...(removed.length > 0 ? [deletePatterns(removed.map((v) => v.id))] : []),
		...(closed ? [closePattern(closed.id, input.effectiveFrom)] : [])
	];
	if (changes.length === 0)
		throw new InvalidInputError('no_personal_pattern', m.roster_error_no_personal());
	await commitVersionChange(
		auditInsert({
			actor: actor.user,
			action: 'shift_pattern.end',
			entityType: 'staff',
			entityId: staffId,
			before: { closed, removed },
			after: { effectiveTo: input.effectiveFrom },
			reason: input.reason
		}),
		changes
	);
	return person;
}

/** Add a supervisor to a team (information only until supervisor accounts). */
export async function addTeamSupervisor(
	actor: Actor,
	teamId: string,
	staffId: string
): Promise<RosterPersonRow> {
	requireActorPermission(actor, 'roster.manage');
	const team = await requireTeam(teamId);
	if (!team.active) throw new ConflictError('team_inactive', m.roster_error_team_inactive());
	const person = await requirePerson(staffId);
	if (!person.active)
		throw new InvalidInputError('staff_inactive', m.roster_error_staff_inactive(), {
			field: 'staffId'
		});

	const id = randomUUID();
	try {
		await db.batch([
			insertSupervisor({ id, teamId, staffId, addedBy: actor.user.id }),
			auditInsert({
				actor: actor.user,
				action: 'team_supervisor.add',
				entityType: 'team',
				entityId: teamId,
				after: { supervisorId: id, staffId }
			})
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('supervisor_exists', m.roster_error_supervisor_exists(), {
				field: 'staffId',
				cause: error
			});
		throw error;
	}
	return person;
}

export async function removeTeamSupervisor(
	actor: Actor,
	teamId: string,
	supervisorId: string
): Promise<RosterPersonRow> {
	requireActorPermission(actor, 'roster.manage');
	const row = await findActiveSupervisor(supervisorId);
	if (!row || row.teamId !== teamId) throw new NotFoundError(m.roster_error_supervisor_not_found());
	const person = await requirePerson(row.staffId);
	await db.batch([
		removeSupervisor(row.id, actor.user.id),
		auditInsert({
			actor: actor.user,
			action: 'team_supervisor.remove',
			entityType: 'team',
			entityId: teamId,
			before: { supervisorId: row.id, staffId: row.staffId }
		})
	]);
	return person;
}
