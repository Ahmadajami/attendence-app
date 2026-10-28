import { arrayContains, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	attendanceEvent,
	rosterOverride,
	shift,
	shiftPattern
} from '#lib/server/db/schema/index.js';

export const shiftColumns = {
	id: shift.id,
	code: shift.code,
	nameEn: shift.nameEn,
	nameAr: shift.nameAr,
	colour: shift.colour,
	startTime: shift.startTime,
	endTime: shift.endTime,
	breakMinutes: shift.breakMinutes,
	requiredMinutes: shift.requiredMinutes,
	windowBeforeMinutes: shift.windowBeforeMinutes,
	windowAfterMinutes: shift.windowAfterMinutes,
	graceMinutes: shift.graceMinutes,
	active: shift.active
};

/** Every shift, active or not, by code. Inactive ones still resolve in saved patterns (plan P2). */
export async function listShiftRows() {
	return db.select(shiftColumns).from(shift).orderBy(asc(shift.code));
}

export type ShiftRow = Awaited<ReturnType<typeof listShiftRows>>[number];

export async function findShift(id: string): Promise<ShiftRow | undefined> {
	const [row] = await db.select(shiftColumns).from(shift).where(eq(shift.id, id)).limit(1);
	return row;
}

/** True once a pattern slot, an override or a punch points at the shift (plan P1). */
export async function isShiftUsed(id: string): Promise<boolean> {
	const found = await Promise.all([
		db
			.select({ id: shiftPattern.id })
			.from(shiftPattern)
			.where(arrayContains(shiftPattern.slots, [id]))
			.limit(1),
		db
			.select({ id: rosterOverride.id })
			.from(rosterOverride)
			.where(eq(rosterOverride.shiftId, id))
			.limit(1),
		db
			.select({ id: attendanceEvent.id })
			.from(attendanceEvent)
			.where(eq(attendanceEvent.shiftId, id))
			.limit(1)
	]);
	return found.some((rows) => rows.length > 0);
}
