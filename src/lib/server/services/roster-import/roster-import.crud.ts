import { and, eq, inArray, isNull, lte, gte, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	importBatch,
	pattern,
	patternAssignment,
	rosterOverride,
	shift,
	staffSchedule,
	swapRequest
} from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

/** Active or pending swap requests of these people touching `[from, to]` (RI5). */
export async function listSwapsBetween(staffIds: readonly string[], from: string, to: string) {
	if (staffIds.length === 0) return [];
	return db
		.select({ staffId: swapRequest.staffId, otherStaffId: swapRequest.otherStaffId })
		.from(swapRequest)
		.where(
			and(
				or(
					inArray(swapRequest.staffId, [...staffIds]),
					inArray(swapRequest.otherStaffId, [...staffIds])
				),
				inArray(swapRequest.state, ['pending', 'approved']),
				or(
					and(gte(swapRequest.firstDate, from), lte(swapRequest.firstDate, to)),
					and(gte(swapRequest.secondDate, from), lte(swapRequest.secondDate, to))
				)
			)
		);
}

/**
 * Every pattern by name (names are unique): a clash is refused before the save, unless it is the same
 * weekly pattern, which is reused (RI11).
 */
export async function listPatternsByName() {
	const rows = await db
		.select({
			id: pattern.id,
			nameEn: pattern.nameEn,
			type: pattern.type,
			slots: pattern.slots,
			active: pattern.active
		})
		.from(pattern);
	return new Map(rows.map((r) => [r.nameEn, r]));
}

/** A committed punch import whose dates overlap `[from, to]`: a roster undo would change its days. */
export async function hasCommittedPunchesBetween(from: string, to: string): Promise<boolean> {
	const [row] = await db
		.select({ id: importBatch.id })
		.from(importBatch)
		.where(
			and(
				eq(importBatch.kind, 'punches'),
				eq(importBatch.status, 'committed'),
				sql`${importBatch.summary}->>'from' <= ${to}`,
				sql`${importBatch.summary}->>'to' >= ${from}`
			)
		)
		.limit(1);
	return row !== undefined;
}

/** What a roster batch created, for its undo. */
export async function listRosterBatchRows(batchId: string) {
	const [patterns, assignments, schedules, overrides, swaps] = await Promise.all([
		db.select({ id: pattern.id }).from(pattern).where(eq(pattern.importBatchId, batchId)),
		db
			.select({
				id: patternAssignment.id,
				staffId: patternAssignment.staffId,
				teamId: patternAssignment.teamId,
				departmentId: patternAssignment.departmentId
			})
			.from(patternAssignment)
			.where(eq(patternAssignment.importBatchId, batchId)),
		db
			.select({ id: staffSchedule.id, staffId: staffSchedule.staffId })
			.from(staffSchedule)
			.where(eq(staffSchedule.importBatchId, batchId)),
		db
			.select({ id: rosterOverride.id, staffId: rosterOverride.staffId })
			.from(rosterOverride)
			.where(and(eq(rosterOverride.importBatchId, batchId), isNull(rosterOverride.cancelledAt))),
		db
			.select({ id: swapRequest.id, staffId: swapRequest.staffId })
			.from(swapRequest)
			.where(and(eq(swapRequest.importBatchId, batchId), eq(swapRequest.state, 'approved')))
	]);
	return { patterns, assignments, schedules, overrides, swaps };
}

/** Undo statements of a roster batch (RI7): day edits and swaps cancelled, assignments and own rules removed, patterns deactivated. */
export function undoRosterStatements(
	batchId: string,
	userId: string,
	at: Date,
	reason: string
): BatchQuery[] {
	return [
		db
			.update(rosterOverride)
			.set({ cancelledAt: at, cancelledBy: userId })
			.where(and(eq(rosterOverride.importBatchId, batchId), isNull(rosterOverride.cancelledAt))),
		db
			.update(swapRequest)
			.set({ state: 'cancelled', cancelledAt: at, cancelledBy: userId, cancelReason: reason })
			.where(and(eq(swapRequest.importBatchId, batchId), eq(swapRequest.state, 'approved'))),
		db.delete(patternAssignment).where(eq(patternAssignment.importBatchId, batchId)),
		db.delete(staffSchedule).where(eq(staffSchedule.importBatchId, batchId)),
		db.update(pattern).set({ active: false }).where(eq(pattern.importBatchId, batchId))
	];
}

/** The shifts a shifts batch created. */
export async function listBatchShifts(batchId: string) {
	return db
		.select({ id: shift.id, code: shift.code, active: shift.active })
		.from(shift)
		.where(eq(shift.importBatchId, batchId));
}

export function deactivateShifts(ids: readonly string[]): BatchQuery[] {
	return ids.length > 0
		? [
				db
					.update(shift)
					.set({ active: false })
					.where(inArray(shift.id, [...ids]))
			]
		: [];
}

export function setImportBatchStatus(
	batchId: string,
	from: 'previewed' | 'committed',
	values: Partial<typeof importBatch.$inferInsert>
): BatchQuery {
	return db
		.update(importBatch)
		.set(values)
		.where(and(eq(importBatch.id, batchId), eq(importBatch.status, from)));
}
