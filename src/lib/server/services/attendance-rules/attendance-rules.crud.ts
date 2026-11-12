import { asc, eq } from 'drizzle-orm';
import type { AttendanceRuleVersion } from '#lib/roster/attendance-rules.js';
import { db } from '#lib/server/db/index.js';
import { attendanceRule, type AttendanceRuleRow } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// The company's attendance-rule versions (OC7). Writes return unexecuted queries for `batch([...])`.

/** Every company version, oldest first (the history and the day resolution). */
export async function listAttendanceRuleRows(): Promise<AttendanceRuleRow[]> {
	return db.select().from(attendanceRule).orderBy(asc(attendanceRule.effectiveFrom));
}

/** A stored version as the pure code resolves it. */
export function toVersion(row: AttendanceRuleRow): AttendanceRuleVersion {
	return {
		id: row.id,
		overtimeStep: row.overtimeStep,
		overtimeMode: row.overtimeMode,
		fridayPrayerOn: row.fridayPrayerOn,
		fridayPrayerMinutes: row.fridayPrayerMinutes,
		fridayPrayerSegments: row.fridayPrayerSegments,
		effectiveFrom: row.effectiveFrom,
		effectiveTo: row.effectiveTo
	};
}

export async function listAttendanceRuleVersions(): Promise<AttendanceRuleVersion[]> {
	return (await listAttendanceRuleRows()).map(toVersion);
}

/** Close an open version at `to` (exclusive), so the next one starts there. */
export function closeAttendanceRule(id: string, to: string): BatchQuery {
	return db.update(attendanceRule).set({ effectiveTo: to }).where(eq(attendanceRule.id, id));
}

export function insertAttendanceRule(values: typeof attendanceRule.$inferInsert): BatchQuery {
	return db.insert(attendanceRule).values(values);
}
