import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { staffTeamMembership } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from './common.js';

// Team membership history (OPERATIONS_PLAN X6). Every `staff.team_id` change puts these statements
// in the same `db.batch`, so `staff_team_membership` always says who was in which team, and when.

/**
 * Record a move from team `from` to team `to` at `at`: close the open membership, then open the
 * next one. Closing first keeps the no-overlap constraint satisfied. Nothing when the team is the same.
 */
export function membershipChange(
	staffId: string,
	from: string | null,
	to: string | null,
	at: Date
): BatchQuery[] {
	if (from === to) return [];
	const statements: BatchQuery[] = [];
	if (from) {
		statements.push(
			db
				.update(staffTeamMembership)
				.set({ validTo: at })
				.where(and(eq(staffTeamMembership.staffId, staffId), isNull(staffTeamMembership.validTo)))
		);
	}
	if (to) {
		statements.push(db.insert(staffTeamMembership).values({ staffId, teamId: to, validFrom: at }));
	}
	return statements;
}

/** Close every open membership of a team that is being deactivated (its members are unassigned). */
export function closeTeamMemberships(teamId: string, at: Date): BatchQuery {
	return db
		.update(staffTeamMembership)
		.set({ validTo: at })
		.where(and(eq(staffTeamMembership.teamId, teamId), isNull(staffTeamMembership.validTo)));
}
