import { randomUUID } from 'node:crypto';
import {
	attendanceRulesOn,
	attendanceVersionOn,
	type AttendanceRuleVersion,
	type ResolvedAttendanceRules
} from '#lib/roster/attendance-rules.js';
import type { AttendanceRuleInput } from '#lib/schemas/attendance-rules.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { requireEffectiveDate } from '../effective-date.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError } from '#lib/server/errors.js';
import { m } from '#lib/paraglide/messages.js';
import { todayInDamascus } from '#lib/server/time.js';
import { requireActorPermission, type Actor } from '../common.js';
import { listStaffToRecompute, markNeedsRecompute } from '../day-results/day-results.crud.js';
import { causeBy, recomputeAfter } from '../day-results/day-results.bl.js';
import {
	closeAttendanceRule,
	insertAttendanceRule,
	listAttendanceRuleRows,
	toVersion
} from './attendance-rules.crud.js';

// The company's attendance rules from a date (OC7). A new version closes the one in force on its
// start date and is inserted with an audit row in one batch; the days from that date to today are
// flagged and recomputed. A version may not start on or before a later one (no rows are deleted;
// the history stays as it was).

export type AttendanceRuleRowView = AttendanceRuleVersion & { reason: string; createdAt: Date };

/** Every company version, oldest first, and the rules in force today (for the admin page). */
export async function getAttendanceRules(actor: Actor): Promise<{
	versions: AttendanceRuleRowView[];
	today: ResolvedAttendanceRules;
}> {
	requireActorPermission(actor, 'settings.manage');
	const rows = await listAttendanceRuleRows();
	const versions = rows.map((row) => ({
		...toVersion(row),
		reason: row.reason,
		createdAt: row.createdAt
	}));
	return { versions, today: attendanceRulesOn(versions, todayInDamascus()) };
}

/** A new company version from a date: one batch with its audit row, then the days are recomputed. */
export async function setAttendanceRule(actor: Actor, input: AttendanceRuleInput): Promise<string> {
	requireActorPermission(actor, 'roster.manage');
	const from = input.effectiveFrom;
	requireEffectiveDate(from);
	const rows = await listAttendanceRuleRows();
	if (rows.some((row) => row.effectiveFrom === from))
		throw new ConflictError('attendance_rule_same_date', m.attendance_rules_error_same_date(), {
			field: 'effectiveFrom'
		});
	if (rows.some((row) => row.effectiveFrom > from))
		throw new ConflictError('attendance_rule_later_exists', m.attendance_rules_error_later(), {
			field: 'effectiveFrom'
		});

	const versions = rows.map(toVersion);
	// The version in force on the new start date ends there (exclusive), if it is still open.
	const closed = attendanceVersionOn(versions, from);
	const values = {
		id: randomUUID(),
		overtimeStep: Number(input.overtimeStep),
		overtimeMode: input.overtimeMode,
		fridayPrayerOn: input.fridayPrayerOn,
		fridayPrayerMinutes: input.fridayPrayerMinutes,
		fridayPrayerSegments: input.fridayPrayerSegments,
		effectiveFrom: from,
		effectiveTo: null,
		reason: input.reason,
		createdBy: actor.user.id
	};
	const today = todayInDamascus();
	const flagged = from <= today ? { from, to: today } : null;
	const staffIds = flagged ? await listStaffToRecompute(flagged.from, flagged.to) : [];
	await batch([
		...(closed ? [closeAttendanceRule(closed.id, from)] : []),
		insertAttendanceRule(values),
		...(flagged ? markNeedsRecompute(staffIds, flagged.from, flagged.to) : []),
		auditInsert({
			actor: actor.user,
			action: 'attendance_rule.set',
			entityType: 'company',
			entityId: 'company',
			before: { closed: closed?.id ?? null, closedTo: closed ? from : null },
			after: values,
			reason: input.reason
		})
	]);
	if (flagged && staffIds.length > 0)
		await recomputeAfter(staffIds, flagged.from, flagged.to, causeBy(actor, 'system'));
	return values.id;
}
