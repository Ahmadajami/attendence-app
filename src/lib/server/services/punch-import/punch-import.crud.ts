import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { absence, attendanceEvent, importBatch, staff } from '#lib/server/db/schema/index.js';
import type { PunchBatchSummary } from '#lib/types/imports.js';
import type { BatchQuery } from '../common.js';

/** The people with these employee numbers (active or not), for matching a punch file. */
export async function listStaffByEmployeeNo(employeeNos: readonly string[]) {
	if (employeeNos.length === 0) return [];
	return db
		.select({
			staffId: staff.id,
			employeeNo: staff.employeeNo,
			active: staff.active,
			departmentId: staff.departmentId
		})
		.from(staff)
		.where(inArray(staff.employeeNo, [...new Set(employeeNos)]));
}

/** Every event a batch inserted (voided ones too). */
export async function listBatchEvents(batchId: string) {
	return db
		.select({
			id: attendanceEvent.id,
			staffId: attendanceEvent.staffId,
			type: attendanceEvent.type,
			occurredAt: attendanceEvent.occurredAt,
			shiftDate: attendanceEvent.shiftDate,
			teamId: attendanceEvent.teamId
		})
		.from(attendanceEvent)
		.where(eq(attendanceEvent.importBatchId, batchId));
}

/** Corrections (void or not) pointing at these events. */
export async function listCorrectionsOf(eventIds: readonly string[]) {
	if (eventIds.length === 0) return [];
	return db
		.select({ correctsEventId: attendanceEvent.correctsEventId, isVoid: attendanceEvent.isVoid })
		.from(attendanceEvent)
		.where(
			and(
				isNotNull(attendanceEvent.correctsEventId),
				inArray(attendanceEvent.correctsEventId, [...eventIds])
			)
		);
}

/** The batch's absences that are still active. */
export async function listActiveBatchAbsences(batchId: string) {
	return db
		.select({ id: absence.id, staffId: absence.staffId })
		.from(absence)
		.where(and(eq(absence.importBatchId, batchId), isNull(absence.cancelledAt)));
}

export function cancelAbsences(ids: readonly string[], userId: string, at: Date): BatchQuery[] {
	return ids.length > 0
		? [
				db
					.update(absence)
					.set({ cancelledAt: at, cancelledBy: userId })
					.where(and(inArray(absence.id, [...ids]), isNull(absence.cancelledAt)))
			]
		: [];
}

export function setBatchCommitted(batchId: string): BatchQuery {
	return db
		.update(importBatch)
		.set({ status: 'committed' })
		.where(and(eq(importBatch.id, batchId), eq(importBatch.status, 'previewed')));
}

export function setBatchUndone(
	batchId: string,
	userId: string,
	at: Date,
	summary: PunchBatchSummary
): BatchQuery {
	return db
		.update(importBatch)
		.set({ status: 'undone', undoneAt: at, undoneBy: userId, summary })
		.where(and(eq(importBatch.id, batchId), eq(importBatch.status, 'committed')));
}
