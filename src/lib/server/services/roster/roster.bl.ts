import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { damascusDayRange, todayInDamascus } from '#lib/server/time.js';
import { addDays, startOfDamascusDay } from '#lib/roster/cycle.js';
import { planVersionChange } from '#lib/roster/versions.js';
import type { EndPatternInput, PatternInput } from '#lib/schemas/roster.schema.js';
import { ancestorChain } from '#lib/workforce/departments.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { listDepartmentRows } from '../departments/departments.crud.js';
import { loadShifts } from '../shifts/shifts.bl.js';
import type { ShiftRow } from '../shifts/shifts.crud.js';
import { findTeam, listTeams as listTeamRows, type TeamRow } from '../teams/teams.crud.js';
import {
	closePattern,
	deletePatterns,
	findActiveSupervisor,
	findRosterPerson,
	insertPattern,
	insertSupervisor,
	listAbsencesBetween,
	listActiveStaffOptions,
	listDepartmentPatterns,
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
	/** Every shift (inactive ones still resolve in saved patterns). */
	shifts: ShiftRow[];
	memberships: MembershipRow[];
	teamPatterns: PatternRow[];
	personalPatterns: PatternRow[];
	departmentPatterns: PatternRow[];
	/** Per person: their department, then its ancestors (nearest first). */
	departmentChains: Record<string, string[]>;
	overrides: OverrideRow[];
	absences: AbsenceRow[];
};

/** A team's pattern in force today, offered as a starting point in the pattern editor. */
export type CycleSource = Pick<TeamRow, 'id' | 'nameEn' | 'nameAr'> &
	Pick<PatternRow, 'type' | 'slots'>;

export type TeamRoster = {
	team: TeamRow;
	today: string;
	canManage: boolean;
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
	versions: PatternRow[];
	cycleSources: CycleSource[];
	preview: RosterPreviewData;
};

async function listCycleSources(today: string): Promise<CycleSource[]> {
	const [teams, patterns] = await Promise.all([listTeamRows(), listTeamPatternsOn(today)]);
	return teams.flatMap(({ id, nameEn, nameAr }) => {
		const pattern = patterns.find((p) => p.teamId === id);
		return pattern ? [{ id, nameEn, nameAr, type: pattern.type, slots: pattern.slots }] : [];
	});
}

type Owner = { teamId: string; staffId?: never } | { staffId: string; teamId?: never };

export type RosterPerson = { staffId: string; departmentId: string | null };

/**
 * Everything `#lib/roster` needs to compute these people's roster for `days` dates from `from`
 * (no permission check: for other services' reads and this service's pages).
 */
export async function loadRosterData(
	people: readonly RosterPerson[],
	from: string,
	days: number = PREVIEW_DAYS,
	extraTeamIds: string[] = []
): Promise<RosterPreviewData> {
	const staffIds = [...new Set(people.map((p) => p.staffId))];
	const last = addDays(from, days - 1);
	const start = startOfDamascusDay(from);
	const end = startOfDamascusDay(addDays(from, days));
	const [shifts, departments, memberships, personalPatterns, overrides, absences] =
		await Promise.all([
			loadShifts(),
			listDepartmentRows(),
			listMembershipsBetween(staffIds, start, end),
			listPersonalPatterns(staffIds),
			listOverridesBetween(staffIds, from, last),
			listAbsencesBetween(staffIds, from, last)
		]);
	const departmentChains = Object.fromEntries(
		people.map((p) => [p.staffId, ancestorChain(departments, p.departmentId)])
	);
	const teamIds = [...new Set([...extraTeamIds, ...memberships.map((m) => m.teamId)])];
	const [teamPatterns, departmentPatterns] = await Promise.all([
		listTeamPatterns(teamIds),
		listDepartmentPatterns([...new Set(Object.values(departmentChains).flat())])
	]);
	return {
		from,
		days,
		shifts,
		memberships,
		teamPatterns,
		personalPatterns,
		departmentPatterns,
		departmentChains,
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

/** A team's members, supervisors, pattern history and the data for a 4-week preview from `from`. */
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
	const [versions, supervisors, staffOptions, cycleSources, preview] = await Promise.all([
		listTeamPatterns([teamId]),
		listTeamSupervisors(teamId),
		canManage ? listActiveStaffOptions() : Promise.resolve([]),
		canManage ? listCycleSources(today) : Promise.resolve([]),
		loadRosterData(members, start, PREVIEW_DAYS, [teamId])
	]);
	return {
		team,
		today,
		canManage,
		versions,
		supervisors,
		members,
		staffOptions,
		cycleSources: cycleSources.filter((s) => s.id !== teamId),
		preview
	};
}

/** One person's own pattern history and their 4-week preview from `from`. */
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
	const [cycleSources, preview] = await Promise.all([
		canManage ? listCycleSources(today) : Promise.resolve([]),
		loadRosterData([person], start)
	]);
	return {
		person,
		today,
		canManage,
		versions: preview.personalPatterns,
		cycleSources,
		preview
	};
}

/** Ids of everyone following a personal pattern now or from a scheduled date. */
export async function listPersonalPatternStaff(actor: Actor): Promise<string[]> {
	requireActorPermission(actor, 'staff.write');
	return listStaffWithPersonalPattern(todayInDamascus());
}

function requireFutureDate(date: string, field: string) {
	if (date < todayInDamascus())
		throw new InvalidInputError('effective_past', m.roster_error_effective_past(), { field });
}

/** Every slot must be an active shift (plan P2); the DB trigger only checks that it exists. */
async function requireActiveSlots(slots: readonly (string | null)[]): Promise<void> {
	const active = new Set((await loadShifts()).filter((s) => s.active).map((s) => s.id));
	if (slots.some((slot) => slot !== null && !active.has(slot)))
		throw new InvalidInputError('shift_inactive', m.roster_error_shift_inactive(), {
			field: 'slots'
		});
}

/**
 * Run a version change and its audit row in one batch; an overlap left by a concurrent save is a
 * 409. `changes` run in order (removals and the close before the insert, for the `EXCLUDE`).
 */
async function commitVersionChange(audit: BatchQuery, changes: BatchQuery[]): Promise<void> {
	try {
		await batch([audit, ...changes]);
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
	await requireActiveSlots(input.slots);

	const { closed, removed } = planVersionChange(versions, input.effectiveFrom);
	const values = {
		id: randomUUID(),
		teamId: owner.teamId ?? null,
		staffId: owner.staffId ?? null,
		type: input.type,
		slots: input.slots,
		anchorDate: input.type === 'cycle' ? input.anchorDate : null,
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

/** A team's new pattern from `effectiveFrom` (today or later). Earlier days keep their cycle. */
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

/** A person's own pattern from `effectiveFrom`, overriding their team's and department's. */
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

/** Stop a person's own pattern from `effectiveFrom`; from then they follow their team. */
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
		await batch([
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
	await batch([
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
