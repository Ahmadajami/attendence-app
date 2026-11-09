import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import { resolvePayRule, type ResolvedPayRule } from '#lib/payroll/pay-rule.js';
import { addDays, daysBetween } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import { rosterDay } from '#lib/roster/roster.js';
import { planVersionChange } from '#lib/roster/versions.js';
import {
	otEnabledOf,
	type HolidayCancelInput,
	type HolidayExceptionInput,
	type HolidayInput,
	type MissionCancelInput,
	type MissionInput,
	type PayRuleInput,
	type PayRuleResetInput
} from '#lib/schemas/pattern-pay.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { personName } from '#lib/utils/locale.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { patternCandidates } from '../assignments/assignments.bl.js';
import { insertAbsences, listEntryPeople } from '../attendance/attendance.crud.js';
import {
	causeBy,
	markNeedsRecompute,
	recomputeAfter,
	type CauseOf
} from '../day-results/day-results.bl.js';
import { listStaffToRecompute } from '../day-results/day-results.crud.js';
import { requireEffectiveDate } from '../effective-date.js';
import { requirePattern } from '../patterns/patterns.bl.js';
import { loadRosterData, type RosterPerson } from '../roster/roster.bl.js';
import {
	cancelAbsenceRows,
	cancelHolidayRow,
	closePayRule,
	deletePayRules,
	findException,
	findHoliday,
	insertHoliday,
	insertPayRule,
	listExceptionsOfPattern,
	listHolidaysOfPattern,
	listMissionRows,
	listMissionsOfPattern,
	listPayRulesOfPattern,
	upsertException,
	type PatternHolidayRow,
	type PayRuleRow
} from './pattern-pay.crud.js';

// A pattern's overtime pay rule, holidays and missions (pay plan PR1–PR15, task 4.2), and the
// company's own rule and holidays (PR35–PR38: `patternId` '' in the forms, `null` in the rows), plus
// how each pattern treats a company holiday. Writes need `roster.manage` (PR13). Each write flags the
// stored days it changes in its own batch, then recomputes them once it committed (PR17), so the
// daily records and the edit log follow.

/** A mission as the pattern's tab lists it: its dates and members (cancelled ones too). */
export type PatternMission = {
	groupId: string;
	startsOn: string;
	endsOn: string;
	reason: string | null;
	members: {
		absenceId: string;
		staffId: string;
		fullName: string;
		fullNameAr: string | null;
		cancelled: boolean;
	}[];
	/** Every member's part is cancelled. */
	cancelled: boolean;
};

/** Someone the mission sheet offers: reached by the pattern's assignments around today. */
export type MissionCandidate = {
	staffId: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
};

/** A company holiday as one pattern sees it (PR36): its exception, if the pattern has one. */
export type CompanyHolidayForPattern = PatternHolidayRow & {
	exception: { applies: boolean; otEligible: boolean | null; reason: string } | null;
};

export type PatternPay = {
	/** The rule on `today`, each field with where it came from (pattern, company or built-in). */
	rule: ResolvedPayRule;
	/** What the pattern inherits today: the company setting over the built-in default (PR35). */
	companyRule: ResolvedPayRule;
	versions: PayRuleRow[];
	holidays: PatternHolidayRow[];
	/** Active company holidays, newest first, with this pattern's exceptions. */
	companyHolidays: CompanyHolidayForPattern[];
	missions: PatternMission[];
	candidates: MissionCandidate[];
};

/** The company's rule and holidays (PR35, PR36), for `/admin/settings`. */
export type CompanyPay = {
	rule: ResolvedPayRule;
	versions: PayRuleRow[];
	holidays: PatternHolidayRow[];
};

/** Days around today whose followers the mission sheet offers (past missions are allowed, PR11). */
const CANDIDATE_DAYS_BEFORE = 31;
const CANDIDATE_DAYS_AFTER = 92;

/** The pattern's "Overtime & pay" and "Holidays & missions" tabs (PR12); view with `staff.write`. */
export async function getPatternPay(actor: Actor, patternId: string): Promise<PatternPay> {
	requireActorPermission(actor, 'staff.write');
	const today = todayInDamascus();
	const [versions, holidays, missionRows, people, companyVersions, company, exceptions] =
		await Promise.all([
			listPayRulesOfPattern(patternId),
			listHolidaysOfPattern(patternId),
			listMissionsOfPattern(patternId),
			patternCandidates(
				patternId,
				addDays(today, -CANDIDATE_DAYS_BEFORE),
				addDays(today, CANDIDATE_DAYS_AFTER)
			),
			listPayRulesOfPattern(null),
			listHolidaysOfPattern(null),
			listExceptionsOfPattern(patternId)
		]);
	const exceptionOf = new Map(exceptions.map((e) => [e.holidayId, e]));
	const missions = new Map<string, PatternMission>();
	for (const row of missionRows) {
		const key = row.groupId ?? row.id;
		const mission = missions.get(key) ?? {
			groupId: key,
			startsOn: row.startsOn,
			endsOn: row.endsOn,
			reason: row.reason,
			members: [],
			cancelled: true
		};
		mission.members.push({
			absenceId: row.id,
			staffId: row.staffId,
			fullName: row.fullName,
			fullNameAr: row.fullNameAr,
			cancelled: row.cancelledAt !== null
		});
		if (row.cancelledAt === null) mission.cancelled = false;
		missions.set(key, mission);
	}
	const candidates = (await listEntryPeople(people.map((p) => p.staffId)))
		.filter((p) => p.active)
		.map((p) => ({
			staffId: p.staffId,
			employeeNo: p.employeeNo,
			fullName: p.fullName,
			fullNameAr: p.fullNameAr
		}));
	return {
		rule: resolvePayRule(versions, today, companyVersions),
		companyRule: resolvePayRule([], today, companyVersions),
		versions,
		holidays,
		companyHolidays: company
			.filter((h) => h.cancelledAt === null)
			.map((h) => {
				const e = exceptionOf.get(h.id);
				return {
					...h,
					exception: e ? { applies: e.applies, otEligible: e.otEligible, reason: e.reason } : null
				};
			}),
		missions: [...missions.values()],
		candidates
	};
}

/** The company's own rule and holidays (PR35, PR36); view with `settings.manage` (PR38). */
export async function getCompanyPay(actor: Actor): Promise<CompanyPay> {
	requireActorPermission(actor, 'settings.manage');
	const [versions, holidays] = await Promise.all([
		listPayRulesOfPattern(null),
		listHolidaysOfPattern(null)
	]);
	return { rule: resolvePayRule([], todayInDamascus(), versions), versions, holidays };
}

/**
 * How a pattern treats a company holiday (PR36): skip it, or give it the pattern's own overtime
 * switch. One row per pattern and holiday, changed in place with an audit row; the pattern's
 * followers on the holiday's stored dates are recomputed.
 */
export async function setHolidayException(
	actor: Actor,
	input: HolidayExceptionInput
): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	const pattern = await requirePattern(input.patternId);
	const holiday = await findHoliday(input.holidayId);
	if (!holiday || holiday.patternId !== null)
		throw new NotFoundError(m.pattern_holiday_error_not_found());
	if (holiday.cancelledAt)
		throw new ConflictError('holiday_cancelled', m.pattern_holiday_error_cancelled());
	const before = await findException(pattern.id, holiday.id);
	const values = { applies: input.applies, otEligible: otEnabledOf(input.otEligible) };
	const range = storedRange(holiday.startsOn, holiday.endsOn);
	await commitAndRecompute(
		[
			upsertException({
				patternId: pattern.id,
				holidayId: holiday.id,
				...values,
				reason: input.reason,
				actorId: actor.user.id
			}),
			auditInsert({
				actor: actor.user,
				action: 'pattern_holiday_exception.set',
				entityType: 'pattern',
				entityId: pattern.id,
				before: before ? { applies: before.applies, otEligible: before.otEligible } : null,
				after: { holidayId: holiday.id, ...values },
				reason: input.reason
			})
		],
		await reachedBy(pattern.id, range),
		range,
		causeBy(actor, 'holiday', 'holiday', holiday.id),
		() => undefined
	);
}

/** Shift dates `[from, to]` capped at today: the stored days a change reaches (PR18). */
function storedRange(from: string, to: string): { from: string; to: string } | null {
	const today = todayInDamascus();
	const last = to < today ? to : today;
	return from > last ? null : { from, to: last };
}

/** The candidates whose day the pattern plans on at least one date of `[from, to]`. */
async function followersBetween(patternId: string, from: string, to: string): Promise<string[]> {
	const people = await patternCandidates(patternId, from, to);
	if (people.length === 0) return [];
	const days = daysBetween(from, to) + 1;
	const data = await loadRosterData(people, from, days);
	return people
		.filter((p) => {
			const input = rosterInputOf(data, p.staffId);
			for (let i = 0; i < days; i++)
				if (rosterDay(input, addDays(from, i)).patternId === patternId) return true;
			return false;
		})
		.map((p) => p.staffId);
}

/** The owner of a rule or holiday: the pattern (checked), or `null` for the company (`''`). */
async function ownerOf(patternId: string): Promise<string | null> {
	return patternId ? (await requirePattern(patternId)).id : null;
}

/**
 * Who a change of `owner`'s rule or holiday reaches on stored dates: the pattern's followers, or for
 * the company everyone with stored days (a pattern that overrides it recomputes to the same row,
 * which the recompute keeps without writing).
 */
async function reachedBy(
	owner: string | null,
	range: { from: string; to: string } | null
): Promise<string[]> {
	if (!range) return [];
	return owner === null
		? listStaffToRecompute(range.from, range.to)
		: followersBetween(owner, range.from, range.to);
}

/** Audit target of an owner's change. */
const auditTarget = (owner: string | null) =>
	owner === null
		? { entityType: 'company', entityId: 'company' }
		: { entityType: 'pattern', entityId: owner };

/** Commit `statements` with the flags on the stored days, then recompute those days. */
async function commitAndRecompute(
	statements: readonly BatchQuery[],
	staffIds: readonly string[],
	range: { from: string; to: string } | null,
	cause: CauseOf,
	conflict: (error: unknown) => ConflictError | undefined
): Promise<void> {
	const reached = range ? staffIds : [];
	try {
		await batch([
			...statements,
			...(range ? markNeedsRecompute(reached, range.from, range.to) : [])
		]);
	} catch (error) {
		throw conflict(error) ?? error;
	}
	if (range && reached.length > 0) await recomputeAfter(reached, range.from, range.to, cause);
}

const overlap = (code: string, message: () => string, field?: string) => (error: unknown) =>
	pgErrorCode(error) === '23P01'
		? new ConflictError(code, message(), { field, cause: error })
		: undefined;

/** A past date is allowed with the reason, up to the backfill limit, until periods exist (B7b). */
const requireFromDate = (date: string) => requireEffectiveDate(date);

/**
 * Close or remove the versions a change from `from` replaces, plus the audit row. A version in force
 * ends at `from`; versions starting on or after it never took effect and are removed (PR5).
 */
async function payRuleChange(owner: string | null, from: string) {
	const versions = await listPayRulesOfPattern(owner);
	const { closed, removed } = planVersionChange(versions, from);
	const statements: BatchQuery[] = [
		...(removed.length > 0 ? [deletePayRules(removed.map((v) => v.id))] : []),
		...(closed ? [closePayRule(closed.id, from)] : [])
	];
	return { closed, removed, statements };
}

/**
 * A new pay-rule version from a date (PR5, PR6) for a pattern, or for the company (PR35): one batch
 * with its audit row; returns its id.
 */
export async function setPayRule(actor: Actor, input: PayRuleInput): Promise<string> {
	requireActorPermission(actor, 'roster.manage');
	const owner = await ownerOf(input.patternId);
	requireFromDate(input.effectiveFrom);
	const from = input.effectiveFrom;
	const { closed, removed, statements } = await payRuleChange(owner, from);
	const values = {
		id: randomUUID(),
		patternId: owner,
		otEnabled: otEnabledOf(input.otEnabled),
		workDayRate: input.workDayRate,
		offDayRate: input.offDayRate,
		holidayRate: input.holidayRate,
		effectiveFrom: from,
		effectiveTo: null,
		reason: input.reason,
		createdBy: actor.user.id
	};
	const range = storedRange(from, todayInDamascus());
	await commitAndRecompute(
		[
			...statements,
			insertPayRule(values),
			auditInsert({
				actor: actor.user,
				action: 'pattern_pay_rule.set',
				...auditTarget(owner),
				before: { closed: closed?.id ?? null, removed },
				after: values,
				reason: input.reason
			})
		],
		await reachedBy(owner, range),
		range,
		causeBy(actor, 'pay_rule', 'pay_rule', values.id),
		overlap('pay_rule_overlap', () => m.pattern_pay_error_overlap(), 'effectiveFrom')
	);
	return values.id;
}

/** Back to the defaults from a date: the version in force ends there, later ones are removed. */
export async function resetPayRule(actor: Actor, input: PayRuleResetInput): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	const owner = await ownerOf(input.patternId);
	requireFromDate(input.effectiveFrom);
	const from = input.effectiveFrom;
	const { closed, removed, statements } = await payRuleChange(owner, from);
	if (statements.length === 0)
		throw new InvalidInputError('nothing_to_reset', m.pattern_pay_error_nothing_to_reset(), {
			field: 'effectiveFrom'
		});
	const range = storedRange(from, todayInDamascus());
	await commitAndRecompute(
		[
			...statements,
			auditInsert({
				actor: actor.user,
				action: 'pattern_pay_rule.reset',
				...auditTarget(owner),
				before: { closed: closed?.id ?? null, removed },
				after: { effectiveTo: from },
				reason: input.reason
			})
		],
		await reachedBy(owner, range),
		range,
		causeBy(actor, 'pay_rule', 'pay_rule', closed?.id ?? null),
		overlap('pay_rule_overlap', () => m.pattern_pay_error_overlap(), 'effectiveFrom')
	);
}

/**
 * A holiday for everyone who follows the pattern on its dates (PR2, PR3, PR8), or for every pattern
 * (`patternId` '', PR36); past dates allowed with a reason (PR11). Returns its id.
 */
export async function addHoliday(actor: Actor, input: HolidayInput): Promise<string> {
	requireActorPermission(actor, 'roster.manage');
	const owner = await ownerOf(input.patternId);
	const values = {
		id: randomUUID(),
		patternId: owner,
		startsOn: input.startsOn,
		endsOn: input.endsOn,
		nameEn: input.nameEn,
		nameAr: input.nameAr,
		otEligible: input.otEligible,
		reason: input.reason,
		createdBy: actor.user.id
	};
	const range = storedRange(values.startsOn, values.endsOn);
	await commitAndRecompute(
		[
			insertHoliday(values),
			auditInsert({
				actor: actor.user,
				action: 'pattern_holiday.add',
				entityType: 'pattern_holiday',
				entityId: values.id,
				after: values,
				reason: input.reason
			})
		],
		await reachedBy(owner, range),
		range,
		causeBy(actor, 'holiday', 'holiday', values.id),
		overlap('holiday_overlap', () => m.pattern_holiday_error_overlap(), 'startsOn')
	);
	return values.id;
}

/** Cancel a holiday: its dates follow the pattern again (kept as history, never deleted). */
export async function cancelHoliday(actor: Actor, input: HolidayCancelInput): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	const holiday = await findHoliday(input.holidayId);
	if (!holiday) throw new NotFoundError(m.pattern_holiday_error_not_found());
	if (holiday.cancelledAt)
		throw new ConflictError('holiday_cancelled', m.pattern_holiday_error_cancelled());
	const range = storedRange(holiday.startsOn, holiday.endsOn);
	await commitAndRecompute(
		[
			cancelHolidayRow(holiday.id, actor.user.id),
			auditInsert({
				actor: actor.user,
				action: 'pattern_holiday.cancel',
				entityType: 'pattern_holiday',
				entityId: holiday.id,
				before: { startsOn: holiday.startsOn, endsOn: holiday.endsOn },
				reason: input.reason
			})
		],
		await reachedBy(holiday.patternId, range),
		range,
		causeBy(actor, 'holiday', 'holiday', holiday.id),
		() => undefined
	);
}

type MissionPerson = RosterPerson & {
	fullName: string;
	fullNameAr: string | null;
	active: boolean;
};

const names = (people: readonly MissionPerson[]) => people.map(personName).join(m.list_separator());

/**
 * Refuse members who are inactive, don't follow the pattern on every date, or are already away on
 * one of them (PR10), naming each.
 */
async function checkMembers(
	patternId: string,
	people: readonly MissionPerson[],
	from: string,
	to: string
): Promise<void> {
	const inactive = people.filter((p) => !p.active);
	if (inactive.length > 0)
		throw new InvalidInputError(
			'mission_inactive',
			m.pattern_mission_error_inactive({ names: names(inactive) }),
			{ field: 'staffIds' }
		);
	const days = daysBetween(from, to) + 1;
	const data = await loadRosterData(people, from, days);
	const notFollowing: MissionPerson[] = [];
	const away: MissionPerson[] = [];
	for (const person of people) {
		const input = rosterInputOf(data, person.staffId);
		const roster = Array.from({ length: days }, (_, i) => rosterDay(input, addDays(from, i)));
		if (roster.some((d) => d.patternId !== patternId)) notFollowing.push(person);
		else if (roster.some((d) => d.source === 'absence')) away.push(person);
	}
	if (notFollowing.length > 0)
		throw new InvalidInputError(
			'mission_not_following',
			m.pattern_mission_error_not_following({ names: names(notFollowing) }),
			{ field: 'staffIds' }
		);
	if (away.length > 0)
		throw new InvalidInputError(
			'mission_absent',
			m.pattern_mission_error_absent({ names: names(away) }),
			{ field: 'staffIds' }
		);
}

/**
 * A full-day mission for the picked members (PR2, PR9, PR10): one `mission` absence per member,
 * sharing a new group id, in one batch with its audit row. Past dates allowed (PR11).
 */
export async function addMission(
	actor: Actor,
	input: MissionInput
): Promise<{ groupId: string; members: number }> {
	requireActorPermission(actor, 'roster.manage');
	const pattern = await requirePattern(input.patternId);
	const staffIds = [...new Set(input.staffIds)];
	const people = await listEntryPeople(staffIds);
	if (people.length !== staffIds.length) throw new NotFoundError(m.attendance_error_person());
	await checkMembers(pattern.id, people, input.startsOn, input.endsOn);

	const groupId = randomUUID();
	const rows = people.map((p) => ({
		id: randomUUID(),
		staffId: p.staffId,
		startsOn: input.startsOn,
		endsOn: input.endsOn,
		type: 'mission' as const,
		reason: input.reason,
		groupId,
		patternId: pattern.id,
		recordedBy: actor.user.id
	}));
	const absenceOf = new Map(rows.map((r) => [r.staffId, r.id]));
	await commitAndRecompute(
		[
			...insertAbsences(rows),
			auditInsert({
				actor: actor.user,
				action: 'mission.add',
				entityType: 'pattern',
				entityId: pattern.id,
				after: {
					groupId,
					absenceIds: rows.map((r) => r.id),
					startsOn: input.startsOn,
					endsOn: input.endsOn,
					members: rows.length
				},
				reason: input.reason
			})
		],
		staffIds,
		storedRange(input.startsOn, input.endsOn),
		(staffId) => causeBy(actor, 'mission', 'absence', absenceOf.get(staffId) ?? null),
		overlap('mission_overlap', () => m.pattern_mission_error_overlap(), 'staffIds')
	);
	return { groupId, members: rows.length };
}

/** Cancel a whole mission, or one member's part (`staffId`); the days follow the roster again. */
export async function cancelMission(
	actor: Actor,
	input: MissionCancelInput
): Promise<{ members: number }> {
	requireActorPermission(actor, 'roster.manage');
	const rows = (await listMissionRows(input.groupId)).filter(
		(r) => !input.staffId || r.staffId === input.staffId
	);
	if (rows.length === 0) throw new NotFoundError(m.pattern_mission_error_not_found());
	const active = rows.filter((r) => r.cancelledAt === null);
	if (active.length === 0)
		throw new ConflictError('mission_cancelled', m.pattern_mission_error_cancelled());
	const absenceOf = new Map(active.map((r) => [r.staffId, r.id]));
	const [first] = active;
	await commitAndRecompute(
		[
			cancelAbsenceRows(
				active.map((r) => r.id),
				actor.user.id
			),
			auditInsert({
				actor: actor.user,
				action: 'mission.cancel',
				entityType: 'mission',
				entityId: input.groupId,
				before: { absenceIds: active.map((r) => r.id), members: active.length },
				reason: input.reason
			})
		],
		active.map((r) => r.staffId),
		storedRange(first.startsOn, first.endsOn),
		(staffId) => causeBy(actor, 'mission', 'absence', absenceOf.get(staffId) ?? null),
		() => undefined
	);
	return { members: active.length };
}
