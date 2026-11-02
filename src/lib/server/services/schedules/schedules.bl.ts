import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import { planVersionChange } from '#lib/roster/versions.js';
import type { ResetScheduleInput, StaffScheduleInput } from '#lib/schemas/pattern.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import {
	causeBy,
	markNeedsRecompute,
	recomputeAfter,
	type RecomputeCause
} from '../day-results/day-results.bl.js';
import { findRosterPerson } from '../roster/roster.crud.js';
import {
	closeSchedule,
	deleteSchedules,
	insertSchedule,
	listSchedules,
	type ScheduleRow
} from './schedules.crud.js';

// A person's own off days (weekly patterns) and crew start (cycles), from a date (builder plan B4,
// B5, B7). Set with `roster.manage`; every change is audited.

function requireFromDate(date: string): void {
	if (date < todayInDamascus())
		throw new InvalidInputError('effective_past', m.roster_error_effective_past(), {
			field: 'effectiveFrom'
		});
}

async function requireActivePerson(staffId: string) {
	const person = await findRosterPerson(staffId);
	if (!person) throw new NotFoundError(m.staff_error_not_found());
	if (!person.active)
		throw new InvalidInputError('staff_inactive', m.roster_error_staff_inactive());
	return person;
}

/** Removals and the close first (for the `EXCLUDE`). */
function versionStatements(versions: readonly ScheduleRow[], from: string) {
	const { closed, removed } = planVersionChange(versions, from);
	const statements: BatchQuery[] = [
		...(removed.length > 0 ? [deleteSchedules(removed.map((v) => v.id))] : []),
		...(closed ? [closeSchedule(closed.id, from)] : [])
	];
	return { closed, removed, statements };
}

/**
 * Commit a schedule change, then recompute the person's stored days it reaches (pay plan PR17):
 * stored days stop at today (PR18) and changes start today or later, so only today, if at all.
 */
async function commit(
	actor: Actor,
	staffId: string,
	from: string,
	statements: BatchQuery[],
	cause: RecomputeCause
): Promise<void> {
	const reached = from <= todayInDamascus() ? [staffId] : [];
	try {
		await batch([...statements, ...markNeedsRecompute(reached, from, from)]);
	} catch (error) {
		if (pgErrorCode(error) === '23P01')
			throw new ConflictError('schedule_overlap', m.roster_error_overlap(), { cause: error });
		throw error;
	}
	await recomputeAfter(reached, from, from, cause);
}

/** A person's own rules from `effectiveFrom`; later scheduled versions are replaced. */
export async function setSchedule(actor: Actor, input: StaffScheduleInput): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	requireFromDate(input.effectiveFrom);
	await requireActivePerson(input.staffId);
	const { closed, removed, statements } = versionStatements(
		await listSchedules([input.staffId]),
		input.effectiveFrom
	);
	const values = {
		id: randomUUID(),
		staffId: input.staffId,
		offWeekdays:
			input.offWeekdays === null ? null : [...new Set(input.offWeekdays)].sort((a, b) => a - b),
		crewStart: input.crewStart,
		effectiveFrom: input.effectiveFrom,
		effectiveTo: null,
		reason: input.reason,
		createdBy: actor.user.id
	};
	await commit(
		actor,
		input.staffId,
		input.effectiveFrom,
		[
			...statements,
			insertSchedule(values),
			auditInsert({
				actor: actor.user,
				action: 'staff_schedule.set',
				entityType: 'staff',
				entityId: input.staffId,
				before: { closed: closed?.id ?? null, removed: removed.map((v) => v.id) },
				after: values,
				reason: input.reason
			})
		],
		causeBy(actor, 'roster_change', 'schedule', values.id)
	);
}

/** Back to the pattern's own days from `effectiveFrom`. */
export async function resetSchedule(actor: Actor, input: ResetScheduleInput): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	requireFromDate(input.effectiveFrom);
	const { closed, removed, statements } = versionStatements(
		await listSchedules([input.staffId]),
		input.effectiveFrom
	);
	if (statements.length === 0)
		throw new InvalidInputError('nothing_to_reset', m.schedule_error_nothing_to_reset(), {
			field: 'effectiveFrom'
		});
	await commit(
		actor,
		input.staffId,
		input.effectiveFrom,
		[
			...statements,
			auditInsert({
				actor: actor.user,
				action: 'staff_schedule.reset',
				entityType: 'staff',
				entityId: input.staffId,
				before: { closed: closed?.id ?? null, removed: removed.map((v) => v.id) },
				after: { effectiveTo: input.effectiveFrom },
				reason: input.reason
			})
		],
		causeBy(actor, 'roster_change')
	);
}
