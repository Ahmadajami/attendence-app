import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	absence,
	pattern,
	patternAssignment,
	rosterOverride,
	staff,
	staffSchedule,
	staffTeamMembership,
	team,
	teamSupervisor
} from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// Roster tables, plus the membership history they read. Reads that show people join `staff` for
// names (until OPERATIONS X18 splits the staff service).

/**
 * One assignment joined with its pattern, in the shape of the old per-owner version (`id` is the
 * assignment's). Builder plan phase 3 replaces these reads with the assignments service.
 */
const patternColumns = {
	id: patternAssignment.id,
	patternId: patternAssignment.patternId,
	teamId: patternAssignment.teamId,
	staffId: patternAssignment.staffId,
	departmentId: patternAssignment.departmentId,
	type: pattern.type,
	slots: pattern.slots,
	defaultWorkShiftId: pattern.defaultWorkShiftId,
	anchorDate: patternAssignment.anchorDate,
	effectiveFrom: patternAssignment.effectiveFrom,
	effectiveTo: patternAssignment.effectiveTo,
	reason: patternAssignment.reason,
	createdAt: patternAssignment.createdAt
};

const assignedPatterns = () =>
	db
		.select(patternColumns)
		.from(patternAssignment)
		.innerJoin(pattern, eq(pattern.id, patternAssignment.patternId));

const personColumns = {
	staffId: staff.id,
	employeeNo: staff.employeeNo,
	fullName: staff.fullName,
	fullNameAr: staff.fullNameAr
};

/** Every version of these teams' patterns, oldest first. */
export async function listTeamPatterns(teamIds: readonly string[]) {
	if (teamIds.length === 0) return [];
	return assignedPatterns()
		.where(inArray(patternAssignment.teamId, [...teamIds]))
		.orderBy(asc(patternAssignment.effectiveFrom));
}

export type PatternRow = Awaited<ReturnType<typeof listTeamPatterns>>[number];

/** Every version of these people's personal patterns, oldest first. */
export async function listPersonalPatterns(staffIds: readonly string[]): Promise<PatternRow[]> {
	if (staffIds.length === 0) return [];
	return assignedPatterns()
		.where(inArray(patternAssignment.staffId, [...staffIds]))
		.orderBy(asc(patternAssignment.effectiveFrom));
}

/** Every version of these departments' patterns, oldest first. */
export async function listDepartmentPatterns(
	departmentIds: readonly string[]
): Promise<PatternRow[]> {
	if (departmentIds.length === 0) return [];
	return assignedPatterns()
		.where(inArray(patternAssignment.departmentId, [...departmentIds]))
		.orderBy(asc(patternAssignment.effectiveFrom));
}

/** Team versions in force on `date`. */
export async function listTeamPatternsOn(date: string): Promise<PatternRow[]> {
	return assignedPatterns().where(
		and(
			isNotNull(patternAssignment.teamId),
			lte(patternAssignment.effectiveFrom, date),
			or(isNull(patternAssignment.effectiveTo), gt(patternAssignment.effectiveTo, date))
		)
	);
}

/** People with a personal pattern in force on `date` or scheduled after it. */
export async function listStaffWithPersonalPattern(date: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ staffId: patternAssignment.staffId })
		.from(patternAssignment)
		.where(
			and(
				isNotNull(patternAssignment.staffId),
				or(isNull(patternAssignment.effectiveTo), gt(patternAssignment.effectiveTo, date))
			)
		);
	return rows.flatMap((r) => (r.staffId ? [r.staffId] : []));
}

export async function listTeamSupervisors(teamId: string) {
	return db
		.select({ id: teamSupervisor.id, addedAt: teamSupervisor.addedAt, ...personColumns })
		.from(teamSupervisor)
		.innerJoin(staff, eq(staff.id, teamSupervisor.staffId))
		.where(and(eq(teamSupervisor.teamId, teamId), isNull(teamSupervisor.removedAt)))
		.orderBy(asc(staff.fullName));
}

export type SupervisorRow = Awaited<ReturnType<typeof listTeamSupervisors>>[number];

/** Current supervisors of every team, for the teams list. */
export async function listActiveSupervisors() {
	return db
		.select({ teamId: teamSupervisor.teamId, ...personColumns })
		.from(teamSupervisor)
		.innerJoin(staff, eq(staff.id, teamSupervisor.staffId))
		.where(isNull(teamSupervisor.removedAt))
		.orderBy(asc(staff.fullName));
}

export async function findActiveSupervisor(id: string) {
	const [row] = await db
		.select({
			id: teamSupervisor.id,
			teamId: teamSupervisor.teamId,
			staffId: teamSupervisor.staffId
		})
		.from(teamSupervisor)
		.where(and(eq(teamSupervisor.id, id), isNull(teamSupervisor.removedAt)))
		.limit(1);
	return row;
}

/** Active staff, for choosing a supervisor. */
export async function listActiveStaffOptions() {
	return db
		.select(personColumns)
		.from(staff)
		.where(eq(staff.active, true))
		.orderBy(asc(staff.fullName));
}

export type StaffOption = Awaited<ReturnType<typeof listActiveStaffOptions>>[number];

/** One person with their current team, for the employee roster page. */
export async function findRosterPerson(staffId: string) {
	const [row] = await db
		.select({
			...personColumns,
			active: staff.active,
			departmentId: staff.departmentId,
			teamId: staff.teamId,
			teamNameEn: team.nameEn,
			teamNameAr: team.nameAr
		})
		.from(staff)
		.leftJoin(team, eq(team.id, staff.teamId))
		.where(eq(staff.id, staffId))
		.limit(1);
	return row;
}

export type RosterPersonRow = NonNullable<Awaited<ReturnType<typeof findRosterPerson>>>;

/** Who was in a team at any time in `[from, to)`, with the span of that membership. */
export async function listTeamMembersBetween(teamId: string, from: Date, to: Date) {
	return db
		.select({
			...personColumns,
			active: staff.active,
			departmentId: staff.departmentId,
			validFrom: staffTeamMembership.validFrom,
			validTo: staffTeamMembership.validTo
		})
		.from(staffTeamMembership)
		.innerJoin(staff, eq(staff.id, staffTeamMembership.staffId))
		.where(
			and(
				eq(staffTeamMembership.teamId, teamId),
				lt(staffTeamMembership.validFrom, to),
				or(isNull(staffTeamMembership.validTo), gt(staffTeamMembership.validTo, from))
			)
		)
		.orderBy(asc(staff.fullName), asc(staffTeamMembership.validFrom));
}

export type TeamMemberRow = Awaited<ReturnType<typeof listTeamMembersBetween>>[number];

/** These people's memberships (any team) overlapping `[from, to)`. */
export async function listMembershipsBetween(staffIds: readonly string[], from: Date, to: Date) {
	if (staffIds.length === 0) return [];
	return db
		.select({
			staffId: staffTeamMembership.staffId,
			teamId: staffTeamMembership.teamId,
			validFrom: staffTeamMembership.validFrom,
			validTo: staffTeamMembership.validTo
		})
		.from(staffTeamMembership)
		.where(
			and(
				inArray(staffTeamMembership.staffId, [...staffIds]),
				lt(staffTeamMembership.validFrom, to),
				or(isNull(staffTeamMembership.validTo), gt(staffTeamMembership.validTo, from))
			)
		);
}

export type MembershipRow = Awaited<ReturnType<typeof listMembershipsBetween>>[number];

/** Active overrides of these people on shift dates `[from, to]`. */
export async function listOverridesBetween(staffIds: readonly string[], from: string, to: string) {
	if (staffIds.length === 0) return [];
	return db
		.select({
			staffId: rosterOverride.staffId,
			shiftDate: rosterOverride.shiftDate,
			shiftId: rosterOverride.shiftId,
			swapGroupId: rosterOverride.swapGroupId
		})
		.from(rosterOverride)
		.where(
			and(
				inArray(rosterOverride.staffId, [...staffIds]),
				isNull(rosterOverride.cancelledAt),
				gte(rosterOverride.shiftDate, from),
				lte(rosterOverride.shiftDate, to)
			)
		);
}

export type OverrideRow = Awaited<ReturnType<typeof listOverridesBetween>>[number];

/** Active absences of these people overlapping dates `[from, to]`. */
export async function listAbsencesBetween(staffIds: readonly string[], from: string, to: string) {
	if (staffIds.length === 0) return [];
	return db
		.select({
			staffId: absence.staffId,
			startsOn: absence.startsOn,
			endsOn: absence.endsOn,
			type: absence.type
		})
		.from(absence)
		.where(
			and(
				inArray(absence.staffId, [...staffIds]),
				isNull(absence.cancelledAt),
				lte(absence.startsOn, to),
				gte(absence.endsOn, from)
			)
		);
}

export type AbsenceRow = Awaited<ReturnType<typeof listAbsencesBetween>>[number];

/** These people's own off days / crew start versions, oldest first. */
export async function listSchedules(staffIds: readonly string[]) {
	if (staffIds.length === 0) return [];
	return db
		.select({
			id: staffSchedule.id,
			staffId: staffSchedule.staffId,
			offWeekdays: staffSchedule.offWeekdays,
			crewStart: staffSchedule.crewStart,
			effectiveFrom: staffSchedule.effectiveFrom,
			effectiveTo: staffSchedule.effectiveTo,
			reason: staffSchedule.reason
		})
		.from(staffSchedule)
		.where(inArray(staffSchedule.staffId, [...staffIds]))
		.orderBy(asc(staffSchedule.effectiveFrom));
}

export type ScheduleRow = Awaited<ReturnType<typeof listSchedules>>[number];

export function insertSupervisor(values: typeof teamSupervisor.$inferInsert): BatchQuery {
	return db.insert(teamSupervisor).values(values);
}

export function removeSupervisor(id: string, removedBy: string): BatchQuery {
	return db
		.update(teamSupervisor)
		.set({ removedAt: new Date(), removedBy })
		.where(eq(teamSupervisor.id, id));
}
