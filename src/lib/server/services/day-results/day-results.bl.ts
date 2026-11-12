import { catchUpRanges } from '#lib/attendance/catch-up.js';
import { dayResultOf, type DayResultValues } from '#lib/attendance/day-result.js';
import {
	dayKey,
	planRecompute,
	SYSTEM_CAUSE,
	type CauseOf,
	type RecomputeCause
} from '#lib/attendance/recompute.js';
import { resolvePayRule, type PayRuleVersion } from '#lib/payroll/pay-rule.js';
import { attendanceRulesOn } from '#lib/roster/attendance-rules.js';
import { MAX_BACKFILL_DAYS } from '#lib/roster/backdate.js';
import { addDays, daysBetween } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import { rosterDay } from '#lib/roster/roster.js';
import type { LogCause, LogSource } from '#lib/schemas/enums.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { InvalidInputError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { m } from '#lib/paraglide/messages.js';
import { requireActorPermission, type Actor } from '../common.js';
import { listEntryPeople, listEventsBetween } from '../attendance/attendance.crud.js';
import {
	listCompanyPayRuleVersions,
	listPayRuleVersions
} from '../pattern-pay/pattern-pay.crud.js';
import { loadRosterData } from '../roster/roster.bl.js';
import { listApprovedSwaps } from '../swaps/swaps.crud.js';
import { listAttendanceRuleVersions } from '../attendance-rules/attendance-rules.crud.js';
import {
	insertLogLines,
	listFlaggedDays,
	listStaffToRecompute,
	listStoredDays,
	upsertDayResults,
	WRITE_CHUNK
} from './day-results.crud.js';

// The stored daily attendance (pay plan PR16–PR23): every writer that changes a day's inputs flags
// the days in its own batch (`markNeedsRecompute`), then calls `recomputeAfter` once it committed.
// A recompute writes the new rows and their edit-log lines in one transaction per chunk.

export { markNeedsRecompute } from './day-results.crud.js';
export { SYSTEM_CAUSE, type CauseOf, type RecomputeCause };

/** People per load: each load reads the roster, events and stored rows of the whole group. */
const PEOPLE_PER_LOAD = 100;

export type RecomputeResult = { written: number; kept: number; logLines: number };

const ZERO: RecomputeResult = { written: 0, kept: 0, logLines: 0 };

const add = (a: RecomputeResult, b: RecomputeResult): RecomputeResult => ({
	written: a.written + b.written,
	kept: a.kept + b.kept,
	logLines: a.logLines + b.logLines
});

/** A cause done by `actor` (or the system). */
export function causeBy(
	actor: Actor | null,
	source: LogSource,
	causeType: LogCause = 'none',
	causeId: string | null = null
): RecomputeCause {
	return {
		source,
		causeType: causeId === null ? 'none' : causeType,
		causeId,
		actorId: actor?.user.id ?? null
	};
}

function groups<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

async function recomputeGroup(
	staffIds: readonly string[],
	from: string,
	last: string,
	cause: CauseOf
): Promise<RecomputeResult> {
	const people = await listEntryPeople(staffIds);
	if (people.length === 0) return ZERO;
	const ids = people.map((p) => p.staffId);
	const days = daysBetween(from, last) + 1;
	const [roster, events, stored] = await Promise.all([
		loadRosterData(people, from, days),
		listEventsBetween(ids, from, last),
		listStoredDays(ids, from, last)
	]);

	const patternIds = [
		...new Set(
			[
				...roster.personalAssignments,
				...roster.teamAssignments,
				...roster.departmentAssignments
			].map((a) => a.patternId)
		)
	];
	const swapIds = [
		...new Set(roster.overrides.flatMap((o) => (o.swapGroupId ? [o.swapGroupId] : [])))
	];
	const [versions, companyVersions, swaps, attendanceVersions] = await Promise.all([
		listPayRuleVersions(patternIds),
		listCompanyPayRuleVersions(),
		listApprovedSwaps(swapIds),
		listAttendanceRuleVersions()
	]);
	const versionsOf = new Map<string, PayRuleVersion[]>();
	for (const v of versions)
		if (v.patternId) versionsOf.set(v.patternId, [...(versionsOf.get(v.patternId) ?? []), v]);
	const swapOf = new Map(swaps.map((s) => [s.id, s]));
	const eventsOf = new Map<string, typeof events>();
	for (const e of events) {
		const key = dayKey(e.staffId, e.shiftDate);
		eventsOf.set(key, [...(eventsOf.get(key) ?? []), e]);
	}

	const now = new Date();
	const computed: DayResultValues[] = [];
	for (const staffId of ids) {
		const input = rosterInputOf(roster, staffId);
		for (let i = 0; i < days; i++) {
			const date = addDays(from, i);
			const day = rosterDay(input, date);
			computed.push(
				dayResultOf({
					staffId,
					day,
					events: eventsOf.get(dayKey(staffId, date)) ?? [],
					pay: resolvePayRule(
						day.patternId ? (versionsOf.get(day.patternId) ?? []) : [],
						date,
						companyVersions
					),
					swap: day.swapGroupId ? (swapOf.get(day.swapGroupId) ?? null) : null,
					rules: attendanceRulesOn(attendanceVersions, date),
					now
				})
			);
		}
	}

	const plan = planRecompute(
		new Map(stored.map((s) => [dayKey(s.values.staffId, s.values.shiftDate), s])),
		computed,
		cause
	);
	// One transaction per chunk: its rows and their log lines commit together.
	for (const slice of groups(plan.write, WRITE_CHUNK)) {
		const keys = new Set(slice.map((w) => dayKey(w.values.staffId, w.values.shiftDate)));
		const lines = plan.logs.filter((l) => keys.has(dayKey(l.staffId, l.shiftDate)));
		await batch([...upsertDayResults(slice), ...insertLogLines(lines)]);
	}
	return { written: plan.write.length, kept: plan.kept, logLines: plan.logs.length };
}

/**
 * Recompute these people's stored days on shift dates `[from, to]`, capped at today (PR18). Writes
 * only new or changed rows (and flagged ones, to clear the flag), with their edit-log lines tagged
 * with `cause`. No permission check: called by services after their own write, and by the actions
 * below.
 */
export async function recomputeDays(
	staffIds: readonly string[],
	from: string,
	to: string,
	cause: CauseOf
): Promise<RecomputeResult> {
	const today = todayInDamascus();
	const last = to < today ? to : today;
	const unique = [...new Set(staffIds)];
	if (unique.length === 0 || from > last) return ZERO;
	let result = ZERO;
	for (const group of groups(unique, PEOPLE_PER_LOAD))
		result = add(result, await recomputeGroup(group, from, last, cause));
	return result;
}

/**
 * `recomputeDays` after a write that has already committed: a failure must not fail the request
 * (the write is saved and its days are flagged), so it is reported and the catch-up repairs it.
 */
export async function recomputeAfter(
	staffIds: readonly string[],
	from: string,
	to: string,
	cause: CauseOf
): Promise<void> {
	try {
		await recomputeDays(staffIds, from, to, cause);
	} catch (error) {
		// Counts and dates only (CLAUDE.md §1): no names, no reasons.
		console.error('[day_result] recompute failed; days stay flagged', {
			people: new Set(staffIds).size,
			from,
			to,
			error: error instanceof Error ? error.message : String(error)
		});
	}
}

/**
 * Repair flagged rows (oldest first, at most `limit`), as the system. Pages call it on load: with
 * nothing flagged it is one index lookup. People flagged over the same dates are recomputed
 * together (`catchUpRanges`).
 */
export async function catchUpFlagged(limit = 2_000): Promise<RecomputeResult> {
	const flagged = await listFlaggedDays(limit);
	if (flagged.length === 0) return ZERO;
	let result = ZERO;
	for (const { staffIds, from, to } of catchUpRanges(flagged))
		result = add(result, await recomputeDays(staffIds, from, to, SYSTEM_CAUSE));
	return result;
}

/** The longest range one backfill may cover, in days (shared with backdated changes, B7b). */
export { MAX_BACKFILL_DAYS };

/**
 * Backfill (plan task 3.3): recompute every active person, and anyone with punches, from `from` to
 * today, as the system; one audit row with the counts. The daily page's "Recompute from a date"
 * calls it (Phase 5).
 */
export async function recomputeFrom(actor: Actor, from: string): Promise<RecomputeResult> {
	requireActorPermission(actor, 'roster.manage');
	const today = todayInDamascus();
	if (from > today || daysBetween(from, today) + 1 > MAX_BACKFILL_DAYS)
		throw new InvalidInputError('recompute_range', m.daily_error_recompute_range(), {
			field: 'from'
		});
	const staffIds = await listStaffToRecompute(from, today);
	const result = await recomputeDays(staffIds, from, today, causeBy(actor, 'system'));
	await batch([
		auditInsert({
			actor: actor.user,
			action: 'day_result.recompute',
			entityType: 'day_result',
			entityId: from,
			after: { from, to: today, people: staffIds.length, ...result }
		})
	]);
	return result;
}
