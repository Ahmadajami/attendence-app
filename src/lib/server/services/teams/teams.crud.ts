import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { staff, team } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

export const teamColumns = {
	id: team.id,
	nameEn: team.nameEn,
	nameAr: team.nameAr,
	departmentId: team.departmentId,
	active: team.active
};

export async function listTeams() {
	return db.select(teamColumns).from(team).orderBy(asc(team.nameEn));
}

export type TeamRow = Awaited<ReturnType<typeof listTeams>>[number];

export async function findTeam(id: string): Promise<TeamRow | undefined> {
	const [row] = await db.select(teamColumns).from(team).where(eq(team.id, id)).limit(1);
	return row;
}

/** Active members per team (from `staff.team_id` until ROSTER_PLAN RE3 moves it to memberships). */
export async function countActiveMembersByTeam() {
	return db
		.select({ teamId: staff.teamId, count: sql<number>`count(*)`.mapWith(Number) })
		.from(staff)
		.where(and(eq(staff.active, true), isNotNull(staff.teamId)))
		.groupBy(staff.teamId);
}

export async function countActiveMembers(teamId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(staff)
		.where(and(eq(staff.teamId, teamId), eq(staff.active, true)));
	return row.count;
}

export function insertTeam(values: typeof team.$inferInsert): BatchQuery {
	return db.insert(team).values(values);
}

export function updateTeam(id: string, values: Partial<typeof team.$inferInsert>): BatchQuery {
	return db.update(team).set(values).where(eq(team.id, id));
}

/** Clear `staff.team_id` for every member of a team being deactivated. */
export function unassignTeamMembers(teamId: string): BatchQuery {
	return db.update(staff).set({ teamId: null }).where(eq(staff.teamId, teamId));
}
