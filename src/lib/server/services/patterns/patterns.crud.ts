import { asc, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	department,
	pattern,
	patternAssignment,
	staff,
	team
} from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// The pattern library (builder plan B1). Who follows a pattern lives in `pattern_assignment`
// (`assignments.crud.ts`); here only the reads the library cards need.

export const patternColumns = {
	id: pattern.id,
	nameEn: pattern.nameEn,
	nameAr: pattern.nameAr,
	type: pattern.type,
	slots: pattern.slots,
	defaultWorkShiftId: pattern.defaultWorkShiftId,
	active: pattern.active,
	createdAt: pattern.createdAt
};

export async function listPatternRows() {
	return db.select(patternColumns).from(pattern).orderBy(asc(pattern.nameEn));
}

export type PatternRow = Awaited<ReturnType<typeof listPatternRows>>[number];

export async function findPattern(id: string): Promise<PatternRow | undefined> {
	const [row] = await db.select(patternColumns).from(pattern).where(eq(pattern.id, id)).limit(1);
	return row;
}

/** True once any assignment (past, current or scheduled) uses the pattern (B3). */
export async function isPatternUsed(id: string): Promise<boolean> {
	const [row] = await db
		.select({ id: patternAssignment.id })
		.from(patternAssignment)
		.where(eq(patternAssignment.patternId, id))
		.limit(1);
	return row !== undefined;
}

/**
 * Every assignment with its target's name, for the library cards (who follows a pattern) and the
 * department filter. `departmentId` is the department of the target (a team's or a person's).
 */
export async function listAssignmentTargets() {
	return db
		.select({
			id: patternAssignment.id,
			patternId: patternAssignment.patternId,
			effectiveFrom: patternAssignment.effectiveFrom,
			effectiveTo: patternAssignment.effectiveTo,
			staffId: patternAssignment.staffId,
			teamId: patternAssignment.teamId,
			departmentId: sql<
				string | null
			>`coalesce(${patternAssignment.departmentId}, ${team.departmentId}, ${staff.departmentId})`,
			nameEn: sql<string>`coalesce(${staff.fullName}, ${team.nameEn}, ${department.nameEn})`,
			nameAr: sql<
				string | null
			>`coalesce(${staff.fullNameAr}, ${team.nameAr}, ${department.nameAr})`
		})
		.from(patternAssignment)
		.leftJoin(staff, eq(staff.id, patternAssignment.staffId))
		.leftJoin(team, eq(team.id, patternAssignment.teamId))
		.leftJoin(department, eq(department.id, patternAssignment.departmentId))
		.orderBy(asc(patternAssignment.effectiveFrom));
}

export type AssignmentTargetRow = Awaited<ReturnType<typeof listAssignmentTargets>>[number];

export function insertPattern(values: typeof pattern.$inferInsert): BatchQuery {
	return db.insert(pattern).values(values);
}

export function updatePattern(
	id: string,
	values: Partial<typeof pattern.$inferInsert>
): BatchQuery {
	return db.update(pattern).set(values).where(eq(pattern.id, id));
}
