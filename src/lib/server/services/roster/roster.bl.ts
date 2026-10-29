import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { damascusDayRange, todayInDamascus } from '#lib/server/time.js';
import { addDays, damascusDate, daysBetween, startOfDamascusDay } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import { patternOn, rosterDay } from '#lib/roster/roster.js';
import type { PatternType } from '#lib/schemas/enums.js';
import { ancestorChain } from '#lib/workforce/departments.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import { listDepartmentRows } from '../departments/departments.crud.js';
import { withSlots } from '../slots.js';
import { loadShifts } from '../shifts/shifts.bl.js';
import type { ShiftRow } from '../shifts/shifts.crud.js';
import { findTeam, type TeamRow } from '../teams/teams.crud.js';
import {
	findActiveSupervisor,
	findRosterPerson,
	insertSupervisor,
	listAbsencesBetween,
	listActiveStaffOptions,
	listDepartmentPatterns,
	listMembershipsBetween,
	listOverridesBetween,
	listPersonalPatterns,
	listSchedules,
	listStaffWithPersonalPattern,
	listTeamMembersBetween,
	listTeamPatterns,
	listTeamSupervisors,
	removeSupervisor,
	type AbsenceRow,
	type MembershipRow,
	type OverrideRow,
	type PatternRow,
	type ScheduleRow,
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
	teamAssignments: PatternRow[];
	personalAssignments: PatternRow[];
	departmentAssignments: PatternRow[];
	/** Per person: their department, then its ancestors (nearest first). */
	departmentChains: Record<string, string[]>;
	schedules: ScheduleRow[];
	overrides: OverrideRow[];
	absences: AbsenceRow[];
};

export type TeamRoster = {
	team: TeamRow;
	today: string;
	canManage: boolean;
	versions: PatternRow[];
	supervisors: SupervisorRow[];
	members: TeamMemberRow[];
	staffOptions: StaffOption[];
	preview: RosterPreviewData;
};

export type PersonRoster = {
	person: RosterPersonRow;
	today: string;
	canManage: boolean;
	versions: PatternRow[];
	preview: RosterPreviewData;
};

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
	const [shifts, departments, memberships, personalAssignments, schedules, overrides, absences] =
		await Promise.all([
			loadShifts(),
			listDepartmentRows(),
			listMembershipsBetween(staffIds, start, end),
			listPersonalPatterns(staffIds),
			listSchedules(staffIds),
			listOverridesBetween(staffIds, from, last),
			listAbsencesBetween(staffIds, from, last)
		]);
	const departmentChains = Object.fromEntries(
		people.map((p) => [p.staffId, ancestorChain(departments, p.departmentId)])
	);
	const teamIds = [...new Set([...extraTeamIds, ...memberships.map((m) => m.teamId)])];
	const [teamAssignments, departmentAssignments] = await Promise.all([
		listTeamPatterns(teamIds),
		listDepartmentPatterns([...new Set(Object.values(departmentChains).flat())])
	]);
	return {
		from,
		days,
		shifts,
		memberships,
		teamAssignments: teamAssignments.map(withSlots),
		personalAssignments: personalAssignments.map(withSlots),
		departmentAssignments: departmentAssignments.map(withSlots),
		departmentChains,
		schedules,
		overrides,
		absences
	};
}

/** A person with what plans their days and their own rules (builder plan 4.3, 4.4). */
export type MemberSchedule = {
	staffId: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	/** Joins the team later: the Damascus date; `null` when already in it (or no team page). */
	joinsOn: string | null;
	/** Who plans their days on that date. */
	follows: 'personal' | 'team' | 'department' | 'none';
	/** The department whose assignment applies (`follows: 'department'`), for its name. */
	department: { id: string; nameEn: string; nameAr: string } | null;
	patternId: string | null;
	patternType: PatternType | null;
	cycleLength: number;
	/** Own off days / crew start in force then; `null`: none. */
	rules: { offWeekdays: number[] | null; crewStart: number | null } | null;
};

type SchedulePerson = {
	staffId: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	departmentId: string | null;
	/** The date to describe (today, or a later join date). */
	date: string;
};

async function describeSchedules(
	people: readonly SchedulePerson[],
	teamIds: string[]
): Promise<MemberSchedule[]> {
	if (people.length === 0) return [];
	const today = todayInDamascus();
	const last = people.reduce((a, p) => (p.date > a ? p.date : a), today);
	const [data, departments] = await Promise.all([
		loadRosterData(people, today, daysBetween(today, last) + 1, teamIds),
		listDepartmentRows()
	]);
	return people.map((person) => {
		const input = rosterInputOf(data, person.staffId);
		const day = rosterDay(input, person.date);
		const lists = [
			['personal', input.personalAssignments],
			['team', input.teamAssignments],
			['department', input.departmentAssignments]
		] as const;
		const found = lists
			.map(([kind, list]) => [kind, list.find((a) => a.id === day.assignmentId)] as const)
			.find(([, a]) => a !== undefined);
		const assignment = found?.[1];
		const department = departments.find((d) => d.id === assignment?.departmentId);
		const schedule = patternOn(input.schedules, person.date);
		return {
			staffId: person.staffId,
			employeeNo: person.employeeNo,
			fullName: person.fullName,
			fullNameAr: person.fullNameAr,
			joinsOn: person.date > today ? person.date : null,
			follows: found?.[0] ?? 'none',
			department: department
				? { id: department.id, nameEn: department.nameEn, nameAr: department.nameAr }
				: null,
			patternId: assignment?.patternId ?? null,
			patternType: assignment?.type ?? null,
			cycleLength: assignment?.slots.length ?? 0,
			rules: schedule
				? {
						offWeekdays: schedule.offWeekdays ? [...schedule.offWeekdays] : null,
						crewStart: schedule.crewStart
					}
				: null
		};
	});
}

/** The members table of a team page: current and future members only. */
export async function listMemberSchedules(actor: Actor, teamId: string): Promise<MemberSchedule[]> {
	requireActorPermission(actor, 'staff.write');
	const today = todayInDamascus();
	const now = new Date();
	const rows = await listTeamMembersBetween(teamId, now, startOfDamascusDay(addDays(today, 36500)));
	const members = [
		...new Map(
			rows.filter((r) => r.validTo === null || r.validTo > now).map((r) => [r.staffId, r])
		).values()
	];
	return describeSchedules(
		members.map((r) => ({ ...r, date: r.validFrom > now ? damascusDate(r.validFrom) : today })),
		[teamId]
	);
}

/** What plans one person's days today, and their own rules (the employee page). */
export async function getPersonSchedule(actor: Actor, staffId: string): Promise<MemberSchedule> {
	requireActorPermission(actor, 'staff.write');
	const person = await requirePerson(staffId);
	const [schedule] = await describeSchedules(
		[{ ...person, date: todayInDamascus() }],
		person.teamId ? [person.teamId] : []
	);
	return schedule;
}

/** Ids of a team's members now or joining later (who a team page may set own rules for). */
export async function listCurrentMemberIds(actor: Actor, teamId: string): Promise<Set<string>> {
	requireActorPermission(actor, 'staff.write');
	const now = new Date();
	const rows = await listTeamMembersBetween(
		teamId,
		now,
		startOfDamascusDay(addDays(todayInDamascus(), 36500))
	);
	return new Set(rows.filter((r) => r.validTo === null || r.validTo > now).map((r) => r.staffId));
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
	const [versions, supervisors, staffOptions, preview] = await Promise.all([
		listTeamPatterns([teamId]),
		listTeamSupervisors(teamId),
		canManage ? listActiveStaffOptions() : Promise.resolve([]),
		loadRosterData(members, start, PREVIEW_DAYS, [teamId])
	]);
	return {
		team,
		today,
		canManage,
		versions: versions.map(withSlots),
		supervisors,
		members,
		staffOptions,
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
	const preview = await loadRosterData([person], start);
	return {
		person,
		today,
		canManage: actor.permissions.has('roster.manage'),
		versions: preview.personalAssignments,
		preview
	};
}

/** Ids of everyone following a personal pattern now or from a scheduled date. */
export async function listPersonalPatternStaff(actor: Actor): Promise<string[]> {
	requireActorPermission(actor, 'staff.write');
	return listStaffWithPersonalPattern(todayInDamascus());
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
