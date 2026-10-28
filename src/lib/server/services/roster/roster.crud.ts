import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	absence,
	rosterOverride,
	shiftPattern,
	staff,
	staffTeamMembership,
	team,
	teamSupervisor
} from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// Roster tables, plus the membership history they read. Reads that show people join `staff` for
// names (until OPERATIONS X18 splits the staff service).

export const patternColumns = {
	id: shiftPattern.id,
	teamId: shiftPattern.teamId,
	staffId: shiftPattern.staffId,
	cycle: shiftPattern.cycle,
	anchorDate: shiftPattern.anchorDate,
	dayStart: shiftPattern.dayStart,
	nightStart: shiftPattern.nightStart,
	effectiveFrom: shiftPattern.effectiveFrom,
	effectiveTo: shiftPattern.effectiveTo,
	reason: shiftPattern.reason,
	createdAt: shiftPattern.createdAt
};

const personColumns = {
	staffId: staff.id,
	employeeNo: staff.employeeNo,
	fullName: staff.fullName,
	fullNameAr: staff.fullNameAr
};

/** Every version of these teams' cycles, oldest first. */
export async function listTeamPatterns(teamIds: readonly string[]) {
	if (teamIds.length === 0) return [];
	return db
		.select(patternColumns)
		.from(shiftPattern)
		.where(inArray(shiftPattern.teamId, [...teamIds]))
		.orderBy(asc(shiftPattern.effectiveFrom));
}

export type PatternRow = Awaited<ReturnType<typeof listTeamPatterns>>[number];

/** Every version of these people's personal cycles, oldest first. */
export async function listPersonalPatterns(staffIds: readonly string[]): Promise<PatternRow[]> {
	if (staffIds.length === 0) return [];
	return db
		.select(patternColumns)
		.from(shiftPattern)
		.where(inArray(shiftPattern.staffId, [...staffIds]))
		.orderBy(asc(shiftPattern.effectiveFrom));
}

/** Team versions in force on `date`. */
export async function listTeamPatternsOn(date: string): Promise<PatternRow[]> {
	return db
		.select(patternColumns)
		.from(shiftPattern)
		.where(
			and(
				isNotNull(shiftPattern.teamId),
				lte(shiftPattern.effectiveFrom, date),
				or(isNull(shiftPattern.effectiveTo), gt(shiftPattern.effectiveTo, date))
			)
		);
}

/** People with a personal cycle in force on `date` or scheduled after it. */
export async function listStaffWithPersonalPattern(date: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ staffId: shiftPattern.staffId })
		.from(shiftPattern)
		.where(
			and(
				isNotNull(shiftPattern.staffId),
				or(isNull(shiftPattern.effectiveTo), gt(shiftPattern.effectiveTo, date))
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
			kind: rosterOverride.kind,
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

export function insertPattern(values: typeof shiftPattern.$inferInsert): BatchQuery {
	return db.insert(shiftPattern).values(values);
}

/** End a version at `effectiveTo` (exclusive). */
export function closePattern(id: string, effectiveTo: string): BatchQuery {
	return db.update(shiftPattern).set({ effectiveTo }).where(eq(shiftPattern.id, id));
}

/** Remove scheduled versions that never took effect (they start today or later). */
export function deletePatterns(ids: readonly string[]): BatchQuery {
	return db.delete(shiftPattern).where(inArray(shiftPattern.id, [...ids]));
}

export function insertSupervisor(values: typeof teamSupervisor.$inferInsert): BatchQuery {
	return db.insert(teamSupervisor).values(values);
}

export function removeSupervisor(id: string, removedBy: string): BatchQuery {
	return db
		.update(teamSupervisor)
		.set({ removedAt: new Date(), removedBy })
		.where(eq(teamSupervisor.id, id));
}
