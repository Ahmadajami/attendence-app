import { and, asc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { pattern, patternAssignment } from '#lib/server/db/schema/index.js';
import type { AssignTargetKind } from '#lib/schemas/pattern.schema.js';
import type { BatchQuery } from '../common.js';

// Who follows which pattern, when (builder plan B1). Rows are never edited: a change closes the
// assignment in force (`effective_to`) and opens the next; later ones it replaces are removed
// (their rows kept in the audit, B7b).

/** An assignment joined with its pattern (the engine's `RosterAssignment`, plus person and reason). */
export const assignmentColumns = {
	id: patternAssignment.id,
	patternId: patternAssignment.patternId,
	staffId: patternAssignment.staffId,
	teamId: patternAssignment.teamId,
	departmentId: patternAssignment.departmentId,
	type: pattern.type,
	slots: pattern.slots,
	defaultWorkShiftId: pattern.defaultWorkShiftId,
	anchorDate: patternAssignment.anchorDate,
	effectiveFrom: patternAssignment.effectiveFrom,
	effectiveTo: patternAssignment.effectiveTo,
	reason: patternAssignment.reason
};

const targetColumn = {
	staff: patternAssignment.staffId,
	team: patternAssignment.teamId,
	department: patternAssignment.departmentId
} as const;

/** Every assignment of these targets (one kind), oldest first. */
export async function listAssignmentsOf(kind: AssignTargetKind, ids: readonly string[]) {
	if (ids.length === 0) return [];
	return db
		.select(assignmentColumns)
		.from(patternAssignment)
		.innerJoin(pattern, eq(pattern.id, patternAssignment.patternId))
		.where(inArray(targetColumn[kind], [...ids]))
		.orderBy(asc(patternAssignment.effectiveFrom));
}

export type AssignmentRow = Awaited<ReturnType<typeof listAssignmentsOf>>[number];

/** A pattern's assignments in force on `date` or starting after it. */
export async function listAssignmentsOfPatternFrom(
	patternId: string,
	date: string
): Promise<AssignmentRow[]> {
	return db
		.select(assignmentColumns)
		.from(patternAssignment)
		.innerJoin(pattern, eq(pattern.id, patternAssignment.patternId))
		.where(
			and(
				eq(patternAssignment.patternId, patternId),
				or(isNull(patternAssignment.effectiveTo), gt(patternAssignment.effectiveTo, date))
			)
		)
		.orderBy(asc(patternAssignment.effectiveFrom));
}

/** A pattern's assignments in force on some date of `[from, to]`. */
export async function listAssignmentsOfPatternBetween(
	patternId: string,
	from: string,
	to: string
): Promise<AssignmentRow[]> {
	return db
		.select(assignmentColumns)
		.from(patternAssignment)
		.innerJoin(pattern, eq(pattern.id, patternAssignment.patternId))
		.where(
			and(
				eq(patternAssignment.patternId, patternId),
				lte(patternAssignment.effectiveFrom, to),
				or(isNull(patternAssignment.effectiveTo), gt(patternAssignment.effectiveTo, from))
			)
		)
		.orderBy(asc(patternAssignment.effectiveFrom));
}

export function insertAssignment(values: typeof patternAssignment.$inferInsert): BatchQuery {
	return db.insert(patternAssignment).values(values);
}

/** End an assignment at `effectiveTo` (exclusive). */
export function closeAssignment(id: string, effectiveTo: string): BatchQuery {
	return db.update(patternAssignment).set({ effectiveTo }).where(eq(patternAssignment.id, id));
}

/** Remove the assignments a change replaces (they start on or after the change date; B7b). */
export function deleteAssignments(ids: readonly string[]): BatchQuery {
	return db.delete(patternAssignment).where(inArray(patternAssignment.id, [...ids]));
}
