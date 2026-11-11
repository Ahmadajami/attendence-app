import { arrayContains, asc, count, eq, isNotNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { dayResult, pattern, rosterOverride, shift } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

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
			.select({ id: pattern.id })
			.from(pattern)
			.where(arrayContains(pattern.slots, [id]))
			.limit(1),
		db
			.select({ id: rosterOverride.id })
			.from(rosterOverride)
			.where(eq(rosterOverride.shiftId, id))
			.limit(1),
		db.select({ id: dayResult.id }).from(dayResult).where(eq(dayResult.shiftId, id)).limit(1)
	]);
	return found.some((rows) => rows.length > 0);
}

/** Per shift: library patterns with a slot on it, overrides, and stored days planned on it. */
export async function countShiftUsage(): Promise<
	Map<string, { patterns: number; overrides: number; events: number }>
> {
	const [patterns, overrides, events] = await Promise.all([
		db.select({ slots: pattern.slots }).from(pattern),
		db
			.select({ shiftId: rosterOverride.shiftId, n: count() })
			.from(rosterOverride)
			.where(isNotNull(rosterOverride.shiftId))
			.groupBy(rosterOverride.shiftId),
		// Punches carry no shift (plan PS1): the stored days planned on the shift count instead.
		db
			.select({ shiftId: dayResult.shiftId, n: count() })
			.from(dayResult)
			.where(isNotNull(dayResult.shiftId))
			.groupBy(dayResult.shiftId)
	]);
	const usage = new Map<string, { patterns: number; overrides: number; events: number }>();
	const entry = (id: string) => {
		let row = usage.get(id);
		if (!row) usage.set(id, (row = { patterns: 0, overrides: 0, events: 0 }));
		return row;
	};
	// Patterns are few (one row per owner version): count their distinct slots here.
	for (const { slots } of patterns)
		for (const id of new Set(slots)) if (id !== null) entry(id).patterns += 1;
	for (const { shiftId, n } of overrides) if (shiftId) entry(shiftId).overrides = n;
	for (const { shiftId, n } of events) if (shiftId) entry(shiftId).events = n;
	return usage;
}

export function insertShift(values: typeof shift.$inferInsert): BatchQuery {
	return db.insert(shift).values(values);
}

export function updateShift(id: string, values: Partial<typeof shift.$inferInsert>): BatchQuery {
	return db.update(shift).set(values).where(eq(shift.id, id));
}
