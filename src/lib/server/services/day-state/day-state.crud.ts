import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { BulkDayTarget } from '#lib/schemas/bulk-day-state.schema.js';
import { db } from '#lib/server/db/index.js';
import { absence, attendanceEvent, dayResult, staff } from '#lib/server/db/schema/index.js';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A person's day states (pay plan PR19): their active `absence` rows. Writes reuse
// `insertAbsences` (attendance) and `cancelAbsenceRows` (pattern pay).

/** One person's active absences overlapping dates `[from, to]`, oldest first. */
export async function listActiveStates(staffId: string, from: string, to: string) {
	return db
		.select({
			id: absence.id,
			staffId: absence.staffId,
			startsOn: absence.startsOn,
			endsOn: absence.endsOn,
			type: absence.type,
			reason: absence.reason,
			groupId: absence.groupId,
			patternId: absence.patternId
		})
		.from(absence)
		.where(
			and(
				eq(absence.staffId, staffId),
				isNull(absence.cancelledAt),
				lte(absence.startsOn, to),
				gte(absence.endsOn, from)
			)
		)
		.orderBy(asc(absence.startsOn));
}

export type StateAbsenceRow = Awaited<ReturnType<typeof listActiveStates>>[number];

/** Return the IDs that were still active, so a concurrent clear cannot split a stale row. */
export function cancelActiveDayStates(ids: readonly string[], actorId: string) {
	return db
		.update(absence)
		.set({ cancelledAt: new Date(), cancelledBy: actorId })
		.where(and(inArray(absence.id, [...ids]), isNull(absence.cancelledAt)))
		.returning({ id: absence.id });
}

export async function readBulkDayState(targets: readonly BulkDayTarget[], tx: Transaction) {
	const days = await tx
		.select({
			staffId: dayResult.staffId,
			shiftDate: dayResult.shiftDate,
			hash: dayResult.inputsHash,
			active: staff.active,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			state: absence
		})
		.from(dayResult)
		.innerJoin(staff, eq(staff.id, dayResult.staffId))
		.leftJoin(
			absence,
			and(
				eq(absence.staffId, dayResult.staffId),
				lte(absence.startsOn, dayResult.shiftDate),
				gte(absence.endsOn, dayResult.shiftDate),
				isNull(absence.cancelledAt)
			)
		)
		.where(
			or(
				...targets.map(({ staffId, shiftDate }) =>
					and(eq(dayResult.staffId, staffId), eq(dayResult.shiftDate, shiftDate))
				)
			)
		);
	const punches = await tx
		.select({
			staffId: attendanceEvent.staffId,
			shiftDate: attendanceEvent.shiftDate,
			id: attendanceEvent.id,
			occurredAt: attendanceEvent.occurredAt,
			correctsEventId: attendanceEvent.correctsEventId,
			isVoid: attendanceEvent.isVoid
		})
		.from(attendanceEvent)
		.where(
			or(
				...targets.map(({ staffId, shiftDate }) =>
					and(eq(attendanceEvent.staffId, staffId), eq(attendanceEvent.shiftDate, shiftDate))
				)
			)
		)
		.orderBy(asc(attendanceEvent.id));
	return { days, punches };
}
