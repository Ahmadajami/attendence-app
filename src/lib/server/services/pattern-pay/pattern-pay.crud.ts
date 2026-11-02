import { and, asc, gte, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { patternHoliday, patternPayRule } from '#lib/server/db/schema/index.js';

// Pattern pay rules and holidays (pay plan PR4–PR8). Reads for the roster and the recompute; the
// writes come with the pattern screens (Phase 4).

/** Every pay-rule version of these patterns, oldest first. */
export async function listPayRuleVersions(patternIds: readonly string[]) {
	if (patternIds.length === 0) return [];
	return db
		.select({
			id: patternPayRule.id,
			patternId: patternPayRule.patternId,
			otEnabled: patternPayRule.otEnabled,
			workDayRate: patternPayRule.workDayRate,
			offDayRate: patternPayRule.offDayRate,
			holidayRate: patternPayRule.holidayRate,
			effectiveFrom: patternPayRule.effectiveFrom,
			effectiveTo: patternPayRule.effectiveTo
		})
		.from(patternPayRule)
		.where(inArray(patternPayRule.patternId, [...patternIds]))
		.orderBy(asc(patternPayRule.effectiveFrom));
}

export type PayRuleVersionRow = Awaited<ReturnType<typeof listPayRuleVersions>>[number];

/** Active (not cancelled) holidays of these patterns overlapping shift dates `[from, to]`. */
export async function listActiveHolidays(patternIds: readonly string[], from: string, to: string) {
	if (patternIds.length === 0) return [];
	return db
		.select({
			id: patternHoliday.id,
			patternId: patternHoliday.patternId,
			startsOn: patternHoliday.startsOn,
			endsOn: patternHoliday.endsOn,
			otEligible: patternHoliday.otEligible
		})
		.from(patternHoliday)
		.where(
			and(
				inArray(patternHoliday.patternId, [...patternIds]),
				isNull(patternHoliday.cancelledAt),
				lte(patternHoliday.startsOn, to),
				gte(patternHoliday.endsOn, from)
			)
		)
		.orderBy(asc(patternHoliday.startsOn));
}

export type HolidayRow = Awaited<ReturnType<typeof listActiveHolidays>>[number];
