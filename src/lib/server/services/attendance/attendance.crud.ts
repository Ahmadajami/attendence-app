import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { absence, attendanceEvent, staff } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

export const eventColumns = {
	id: attendanceEvent.id,
	staffId: attendanceEvent.staffId,
	type: attendanceEvent.type,
	occurredAt: attendanceEvent.occurredAt,
	shiftDate: attendanceEvent.shiftDate,
	shiftId: attendanceEvent.shiftId,
	teamId: attendanceEvent.teamId,
	correctsEventId: attendanceEvent.correctsEventId,
	reason: attendanceEvent.reason,
	isVoid: attendanceEvent.isVoid,
	source: attendanceEvent.source
};

/** Every event (corrections and corrected ones too) of these people on shift dates `[from, to]`. */
export async function listEventsBetween(staffIds: readonly string[], from: string, to: string) {
	if (staffIds.length === 0) return [];
	return db
		.select(eventColumns)
		.from(attendanceEvent)
		.where(
			and(
				inArray(attendanceEvent.staffId, [...staffIds]),
				gte(attendanceEvent.shiftDate, from),
				lte(attendanceEvent.shiftDate, to)
			)
		)
		.orderBy(asc(attendanceEvent.occurredAt));
}

export type EventRow = Awaited<ReturnType<typeof listEventsBetween>>[number];

export async function findEvent(id: string): Promise<EventRow | undefined> {
	const [row] = await db
		.select(eventColumns)
		.from(attendanceEvent)
		.where(eq(attendanceEvent.id, id))
		.limit(1);
	return row;
}

const entryPersonColumns = {
	staffId: staff.id,
	employeeNo: staff.employeeNo,
	fullName: staff.fullName,
	fullNameAr: staff.fullNameAr,
	departmentId: staff.departmentId,
	active: staff.active
};

/** These people, for the entry sheet. */
export async function listEntryPeople(staffIds: readonly string[]) {
	if (staffIds.length === 0) return [];
	return db
		.select(entryPersonColumns)
		.from(staff)
		.where(inArray(staff.id, [...staffIds]))
		.orderBy(asc(staff.fullName));
}

export type EntryPersonRow = Awaited<ReturnType<typeof listEntryPeople>>[number];

/** Active people in these departments. */
export async function listActiveStaffInDepartments(
	departmentIds: readonly string[]
): Promise<EntryPersonRow[]> {
	if (departmentIds.length === 0) return [];
	return db
		.select(entryPersonColumns)
		.from(staff)
		.where(and(eq(staff.active, true), inArray(staff.departmentId, [...departmentIds])))
		.orderBy(asc(staff.fullName));
}

export function insertEvents(values: (typeof attendanceEvent.$inferInsert)[]): BatchQuery[] {
	return values.length > 0 ? [db.insert(attendanceEvent).values(values)] : [];
}

export function insertAbsences(values: (typeof absence.$inferInsert)[]): BatchQuery[] {
	return values.length > 0 ? [db.insert(absence).values(values)] : [];
}
