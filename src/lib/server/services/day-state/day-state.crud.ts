import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { absence } from '#lib/server/db/schema/index.js';

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
