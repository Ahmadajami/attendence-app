import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	absence,
	patternHoliday,
	patternHolidayException,
	patternPayRule,
	staff
} from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// Pattern pay rules, holidays and missions (pay plan PR4–PR11), and the company's own rules and
// holidays: the rows with no pattern (PR35–PR37). Reads for the roster, the recompute and the
// screens; writes return unexecuted queries for `batch([...])`.

/** `owner` `null`: the company's rows. */
const ownedBy = (
	column: typeof patternPayRule.patternId | typeof patternHoliday.patternId,
	owner: string | null
) => (owner === null ? isNull(column) : eq(column, owner));

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

/** The company's pay-rule versions (PR35), oldest first, for the recompute. */
export async function listCompanyPayRuleVersions() {
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
		.where(isNull(patternPayRule.patternId))
		.orderBy(asc(patternPayRule.effectiveFrom));
}

/**
 * One pattern's pay-rule versions (`null`: the company's) with their reasons, oldest first (the pay
 * tabs, copies, changes).
 */
export async function listPayRulesOfPattern(patternId: string | null) {
	return db
		.select({
			id: patternPayRule.id,
			patternId: patternPayRule.patternId,
			otEnabled: patternPayRule.otEnabled,
			workDayRate: patternPayRule.workDayRate,
			offDayRate: patternPayRule.offDayRate,
			holidayRate: patternPayRule.holidayRate,
			effectiveFrom: patternPayRule.effectiveFrom,
			effectiveTo: patternPayRule.effectiveTo,
			reason: patternPayRule.reason,
			createdAt: patternPayRule.createdAt
		})
		.from(patternPayRule)
		.where(ownedBy(patternPayRule.patternId, patternId))
		.orderBy(asc(patternPayRule.effectiveFrom));
}

export type PayRuleRow = Awaited<ReturnType<typeof listPayRulesOfPattern>>[number];

export function insertPayRule(values: typeof patternPayRule.$inferInsert): BatchQuery {
	return db.insert(patternPayRule).values(values);
}

/** End a version at `effectiveTo` (exclusive). */
export function closePayRule(id: string, effectiveTo: string): BatchQuery {
	return db.update(patternPayRule).set({ effectiveTo }).where(eq(patternPayRule.id, id));
}

/** Remove versions that start on or after the change date (PR5, B7b). */
export function deletePayRules(ids: readonly string[]): BatchQuery {
	return db.delete(patternPayRule).where(inArray(patternPayRule.id, [...ids]));
}

/**
 * Active (not cancelled) holidays of these patterns, and the company's (PR36), overlapping shift
 * dates `[from, to]`.
 */
export async function listActiveHolidays(patternIds: readonly string[], from: string, to: string) {
	const owners =
		patternIds.length === 0
			? isNull(patternHoliday.patternId)
			: or(isNull(patternHoliday.patternId), inArray(patternHoliday.patternId, [...patternIds]));
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
				owners,
				isNull(patternHoliday.cancelledAt),
				lte(patternHoliday.startsOn, to),
				gte(patternHoliday.endsOn, from)
			)
		)
		.orderBy(asc(patternHoliday.startsOn));
}

export type HolidayRow = Awaited<ReturnType<typeof listActiveHolidays>>[number];

export async function findHoliday(id: string) {
	const [row] = await db
		.select({
			id: patternHoliday.id,
			patternId: patternHoliday.patternId,
			startsOn: patternHoliday.startsOn,
			endsOn: patternHoliday.endsOn,
			otEligible: patternHoliday.otEligible,
			cancelledAt: patternHoliday.cancelledAt
		})
		.from(patternHoliday)
		.where(eq(patternHoliday.id, id));
	return row;
}

/** One pattern's holidays (`null`: the company's), cancelled ones too, newest first. */
export async function listHolidaysOfPattern(patternId: string | null) {
	return db
		.select({
			id: patternHoliday.id,
			patternId: patternHoliday.patternId,
			startsOn: patternHoliday.startsOn,
			endsOn: patternHoliday.endsOn,
			nameEn: patternHoliday.nameEn,
			nameAr: patternHoliday.nameAr,
			otEligible: patternHoliday.otEligible,
			reason: patternHoliday.reason,
			cancelledAt: patternHoliday.cancelledAt
		})
		.from(patternHoliday)
		.where(ownedBy(patternHoliday.patternId, patternId))
		.orderBy(desc(patternHoliday.startsOn));
}

export type PatternHolidayRow = Awaited<ReturnType<typeof listHolidaysOfPattern>>[number];

export function insertHoliday(values: typeof patternHoliday.$inferInsert): BatchQuery {
	return db.insert(patternHoliday).values(values);
}

/** Cancel a holiday; a no-op when it is already cancelled. */
export function cancelHolidayRow(id: string, cancelledBy: string): BatchQuery {
	return db
		.update(patternHoliday)
		.set({ cancelledAt: new Date(), cancelledBy })
		.where(and(eq(patternHoliday.id, id), isNull(patternHoliday.cancelledAt)));
}

/** These patterns' exceptions to company holidays (PR36), for the roster. */
export async function listHolidayExceptions(patternIds: readonly string[]) {
	if (patternIds.length === 0) return [];
	return db
		.select({
			patternId: patternHolidayException.patternId,
			holidayId: patternHolidayException.holidayId,
			applies: patternHolidayException.applies,
			otEligible: patternHolidayException.otEligible
		})
		.from(patternHolidayException)
		.where(inArray(patternHolidayException.patternId, [...patternIds]));
}

export type HolidayExceptionRow = Awaited<ReturnType<typeof listHolidayExceptions>>[number];

/** One pattern's exceptions with their reasons (the pattern's Holidays tab). */
export async function listExceptionsOfPattern(patternId: string) {
	return db
		.select({
			id: patternHolidayException.id,
			holidayId: patternHolidayException.holidayId,
			applies: patternHolidayException.applies,
			otEligible: patternHolidayException.otEligible,
			reason: patternHolidayException.reason
		})
		.from(patternHolidayException)
		.where(eq(patternHolidayException.patternId, patternId));
}

export async function findException(patternId: string, holidayId: string) {
	const [row] = await db
		.select({
			id: patternHolidayException.id,
			applies: patternHolidayException.applies,
			otEligible: patternHolidayException.otEligible
		})
		.from(patternHolidayException)
		.where(
			and(
				eq(patternHolidayException.patternId, patternId),
				eq(patternHolidayException.holidayId, holidayId)
			)
		);
	return row;
}

/** Set how a pattern treats a company holiday: one row per pattern and holiday, changed in place. */
export function upsertException(values: {
	patternId: string;
	holidayId: string;
	applies: boolean;
	otEligible: boolean | null;
	reason: string;
	actorId: string;
}): BatchQuery {
	const set = {
		applies: values.applies,
		otEligible: values.otEligible,
		reason: values.reason,
		updatedBy: values.actorId
	};
	return db
		.insert(patternHolidayException)
		.values({
			patternId: values.patternId,
			holidayId: values.holidayId,
			...set,
			createdBy: values.actorId
		})
		.onConflictDoUpdate({
			target: [patternHolidayException.patternId, patternHolidayException.holidayId],
			set: { ...set, updatedAt: new Date() }
		});
}

/** A mission's rows (one per member), cancelled ones too. */
export async function listMissionRows(groupId: string) {
	return db
		.select({
			id: absence.id,
			staffId: absence.staffId,
			patternId: absence.patternId,
			startsOn: absence.startsOn,
			endsOn: absence.endsOn,
			cancelledAt: absence.cancelledAt
		})
		.from(absence)
		.where(and(eq(absence.groupId, groupId), eq(absence.type, 'mission')));
}

export type MissionRow = Awaited<ReturnType<typeof listMissionRows>>[number];

/** The mission rows recorded from one pattern, with each member's name, newest first. */
export async function listMissionsOfPattern(patternId: string) {
	return db
		.select({
			id: absence.id,
			groupId: absence.groupId,
			staffId: absence.staffId,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			startsOn: absence.startsOn,
			endsOn: absence.endsOn,
			reason: absence.reason,
			cancelledAt: absence.cancelledAt
		})
		.from(absence)
		.innerJoin(staff, eq(staff.id, absence.staffId))
		.where(and(eq(absence.patternId, patternId), eq(absence.type, 'mission')))
		.orderBy(desc(absence.startsOn), asc(staff.fullName));
}

export type PatternMissionRow = Awaited<ReturnType<typeof listMissionsOfPattern>>[number];

/** Cancel these absences; already cancelled ones are left as they are. */
export function cancelAbsenceRows(ids: readonly string[], cancelledBy: string): BatchQuery {
	return db
		.update(absence)
		.set({ cancelledAt: new Date(), cancelledBy })
		.where(and(inArray(absence.id, [...ids]), isNull(absence.cancelledAt)));
}
