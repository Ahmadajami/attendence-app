import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import { planClear } from '#lib/attendance/day-state.js';
import { daysBetween } from '#lib/roster/cycle.js';
import type { DayStateClearInput, DayStateInput } from '#lib/schemas/day-state.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { insertAbsences, listEntryPeople } from '../attendance/attendance.crud.js';
import {
	causeBy,
	markNeedsRecompute,
	recomputeAfter,
	type RecomputeCause
} from '../day-results/day-results.bl.js';
import { cancelAbsenceRows } from '../pattern-pay/pattern-pay.crud.js';
import { listActiveStates, type StateAbsenceRow } from './day-state.crud.js';

// The day editor (pay plan PR19, task 5.1): HR sets a person's state (leave, sick, mission, no
// show, other) for one day or a range, with a reason, or clears it. A state is an `absence` row
// (overlaps refused by the `EXCLUDE`, cancelled never deleted). Needs `attendance.record` (PR13);
// past dates are allowed (PR11). Each write flags the stored days in its own batch, then recomputes
// them (source `day_edit`, cause the absence), so the daily records and the edit log follow (PR17).
// Reasons stay on the absence row only: they may hold health details, so neither the audit row of
// a set nor the edit log copies them.

/** Shift dates `[from, to]` capped at today: the stored days a change reaches (PR18). */
function storedRange(from: string, to: string): { from: string; to: string } | null {
	const today = todayInDamascus();
	const last = to < today ? to : today;
	return from > last ? null : { from, to: last };
}

async function requirePerson(staffId: string) {
	const [person] = await listEntryPeople([staffId]);
	if (!person) throw new NotFoundError(m.attendance_error_person());
	if (!person.active)
		throw new InvalidInputError('person_inactive', m.attendance_error_person(), {
			field: 'staffId'
		});
	return person;
}

/** `2026-03-01 – 2026-03-04` for each row, as the overlap refusal lists them. */
const rangesOf = (rows: readonly StateAbsenceRow[]) =>
	rows
		.map((r) => (r.startsOn === r.endsOn ? r.startsOn : `${r.startsOn} – ${r.endsOn}`))
		.join(m.list_separator());

async function commit(
	statements: readonly BatchQuery[],
	staffId: string,
	range: { from: string; to: string } | null,
	cause: RecomputeCause
): Promise<void> {
	try {
		await batch([
			...statements,
			...(range ? markNeedsRecompute([staffId], range.from, range.to) : [])
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23P01')
			throw new ConflictError('day_state_overlap', m.day_state_error_overlap_saved(), {
				field: 'startsOn',
				cause: error
			});
		throw error;
	}
	if (range) await recomputeAfter([staffId], range.from, range.to, cause);
}

/**
 * Set a state on dates `[startsOn, endsOn]`: one absence row. Refused, with the dates listed, when
 * any of those dates already has a state (clear it first).
 */
export async function setDayState(
	actor: Actor,
	input: DayStateInput
): Promise<{ absenceId: string; days: number }> {
	requireActorPermission(actor, 'attendance.record');
	await requirePerson(input.staffId);
	const existing = await listActiveStates(input.staffId, input.startsOn, input.endsOn);
	if (existing.length > 0)
		throw new ConflictError(
			'day_state_overlap',
			m.day_state_error_overlap({ dates: rangesOf(existing) }),
			{ field: 'startsOn' }
		);

	const id = randomUUID();
	await commit(
		[
			...insertAbsences([
				{
					id,
					staffId: input.staffId,
					startsOn: input.startsOn,
					endsOn: input.endsOn,
					type: input.state,
					reason: input.reason,
					recordedBy: actor.user.id
				}
			]),
			auditInsert({
				actor: actor.user,
				action: 'day_state.set',
				entityType: 'absence',
				entityId: id,
				// Dates and the state only: the reason may hold health details.
				after: {
					staffId: input.staffId,
					startsOn: input.startsOn,
					endsOn: input.endsOn,
					state: input.state
				}
			})
		],
		input.staffId,
		storedRange(input.startsOn, input.endsOn),
		causeBy(actor, 'day_edit', 'absence', id)
	);
	return { absenceId: id, days: daysBetween(input.startsOn, input.endsOn) + 1 };
}

/**
 * Clear every state on dates `[startsOn, endsOn]`: the days follow the roster again. A state that
 * reaches past the range is cancelled and its outer parts recorded again (same type and reason). A
 * pattern mission is cleared on its pattern's tab instead, so its members stay together.
 */
export async function clearDayState(
	actor: Actor,
	input: DayStateClearInput
): Promise<{ cleared: number }> {
	requireActorPermission(actor, 'attendance.record');
	await requirePerson(input.staffId);
	const rows = await listActiveStates(input.staffId, input.startsOn, input.endsOn);
	if (rows.length === 0) throw new InvalidInputError('day_state_none', m.day_state_error_none());
	if (rows.some((r) => r.patternId !== null))
		throw new ConflictError('day_state_pattern_mission', m.day_state_error_pattern_mission());

	const plan = planClear(rows, input.startsOn, input.endsOn);
	const kept = plan.keep.map((part) => ({
		id: randomUUID(),
		staffId: input.staffId,
		startsOn: part.startsOn,
		endsOn: part.endsOn,
		type: part.from.type,
		reason: part.from.reason,
		recordedBy: actor.user.id
	}));
	const cancelled = plan.cancel.map((r) => r.id);
	await commit(
		[
			// Cancelled first, so the kept parts never overlap the rows they replace.
			cancelAbsenceRows(cancelled, actor.user.id),
			...insertAbsences(kept),
			auditInsert({
				actor: actor.user,
				action: 'day_state.clear',
				entityType: 'staff',
				entityId: input.staffId,
				before: { absenceIds: cancelled },
				after: {
					startsOn: input.startsOn,
					endsOn: input.endsOn,
					keptAbsenceIds: kept.map((k) => k.id)
				},
				reason: input.reason
			})
		],
		input.staffId,
		storedRange(input.startsOn, input.endsOn),
		causeBy(actor, 'day_edit', 'absence', cancelled[0])
	);
	return { cleared: cancelled.length };
}
