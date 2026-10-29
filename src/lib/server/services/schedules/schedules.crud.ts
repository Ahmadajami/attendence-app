import { eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { staffSchedule } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// A person's own off days and crew start, versioned like assignments (builder plan B4, B5). Reads
// go through `roster.crud.ts` `listSchedules`, which the roster preview shares.

export { listSchedules, type ScheduleRow } from '../roster/roster.crud.js';

export function insertSchedule(values: typeof staffSchedule.$inferInsert): BatchQuery {
	return db.insert(staffSchedule).values(values);
}

/** End a version at `effectiveTo` (exclusive). */
export function closeSchedule(id: string, effectiveTo: string): BatchQuery {
	return db.update(staffSchedule).set({ effectiveTo }).where(eq(staffSchedule.id, id));
}

/** Remove scheduled versions that never took effect (they start today or later). */
export function deleteSchedules(ids: readonly string[]): BatchQuery {
	return db.delete(staffSchedule).where(inArray(staffSchedule.id, [...ids]));
}
