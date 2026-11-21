import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AUTH_JWT_SECRET } from '$app/env/private';
import { m } from '#lib/paraglide/messages.js';
import { keepOutsideDates, planClear } from '#lib/attendance/day-state.js';
import { dayKey } from '#lib/attendance/recompute.js';
import { effectiveEvents } from '#lib/roster/attendance.js';
import { daysBetween } from '#lib/roster/cycle.js';
import type {
	BulkDayReview,
	BulkDayReviewRow,
	BulkDayStateInput
} from '#lib/schemas/bulk-day-state.schema.js';
import type { DayStateClearInput, DayStateInput } from '#lib/schemas/day-state.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch, db } from '#lib/server/db/index.js';
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
import { getDailyAttendance, type DailyFilter } from '../daily/daily.bl.js';
import {
	cancelActiveDayStates,
	listActiveStates,
	readBulkDayState,
	type StateAbsenceRow
} from './day-state.crud.js';

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
	cause: RecomputeCause,
	cancellation?: { ids: string[]; actorId: string }
): Promise<void> {
	try {
		const writes = [
			...statements,
			...(range ? markNeedsRecompute([staffId], range.from, range.to) : [])
		];
		if (cancellation) {
			await db.transaction(async (tx) => {
				const canceledRows = await tx.execute(
					cancelActiveDayStates(cancellation.ids, cancellation.actorId).getSQL()
				);
				if (canceledRows.length !== cancellation.ids.length)
					throw new ConflictError('day_state_overlap', m.day_state_error_overlap_saved());
				for (const write of writes) await tx.execute(write.getSQL());
			});
		} else {
			await batch(writes);
		}
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
		causeBy(actor, 'day_edit', 'absence', cancelled[0]),
		{ ids: cancelled, actorId: actor.user.id }
	);
	return { cleared: cancelled.length };
}

const staleReview = () => new ConflictError('day_state_bulk_stale', m.daily_bulk_stale());
const keyOf = ({ staffId, shiftDate }: { staffId: string; shiftDate: string }) =>
	dayKey(staffId, shiftDate);

async function bulkPage(actor: Actor, filter: DailyFilter, input: BulkDayStateInput) {
	requireActorPermission(actor, 'staff.write', 'attendance.record');
	const page = await getDailyAttendance(actor, filter);
	const visible = new Map(
		page.rows.map(({ person, figures }) => [dayKey(person.staffId, figures.shiftDate), person])
	);
	if (input.targets.some((target) => !visible.has(keyOf(target)))) throw staleReview();
	return visible;
}

function buildBulkReview(
	actor: Actor,
	filter: DailyFilter,
	input: BulkDayStateInput,
	visible: Awaited<ReturnType<typeof bulkPage>>,
	{ days, punches }: Awaited<ReturnType<typeof readBulkDayState>>
) {
	const selected = new Map(days.map((day) => [keyOf(day), day]));
	const evidence = Map.groupBy(punches, keyOf);
	const proposed = input.operation === 'clear' ? null : input.operation;
	const rows = input.targets.map((target): BulkDayReviewRow => {
		const key = keyOf(target);
		const day = selected.get(key);
		const state = day?.state;
		const current = state?.type ?? null;
		let outcome: BulkDayReviewRow['outcome'] = 'change';
		if (!day?.active) outcome = 'unavailable';
		else if (state?.patternId || state?.groupId) outcome = 'pattern';
		else if (state?.importBatchId) outcome = 'owned';
		else if (current === proposed) outcome = 'unchanged';
		const person = visible.get(key)!;
		return {
			...target,
			person: { fullName: person.fullName, fullNameAr: person.fullNameAr },
			current,
			proposed,
			hasPunches: effectiveEvents(evidence.get(key) ?? []).length > 0,
			outcome
		};
	});
	const changes = rows.filter((row) => row.outcome === 'change').length;
	const unchanged = rows.filter((row) => row.outcome === 'unchanged').length;
	if (!AUTH_JWT_SECRET) throw new Error('AUTH_JWT_SECRET is not set');
	const version = createHmac('sha256', AUTH_JWT_SECRET)
		.update('attendance-bulk-day-state:')
		.update(
			JSON.stringify([
				actor.user.id,
				filter,
				input.operation,
				input.reason,
				input.targets.map((target) => {
					const key = keyOf(target);
					const day = selected.get(key);
					return [key, day?.active, day?.hash, day?.state?.id, evidence.get(key)];
				})
			])
		)
		.digest('hex');
	const review = { rows, changes, unchanged, blocked: rows.length - changes - unchanged, version };
	return { review, selected };
}

export async function reviewBulkDayState(
	actor: Actor,
	filter: DailyFilter,
	input: BulkDayStateInput
): Promise<BulkDayReview> {
	const visible = await bulkPage(actor, filter, input);
	return db.transaction(
		async (tx) =>
			buildBulkReview(actor, filter, input, visible, await readBulkDayState(input.targets, tx))
				.review,
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
}

export async function applyBulkDayState(
	actor: Actor,
	filter: DailyFilter,
	input: BulkDayStateInput
): Promise<number> {
	const visible = await bulkPage(actor, filter, input);
	if (!input.version) throw staleReview();

	const applied = await db
		.transaction(
			async (tx) => {
				const { review, selected } = buildBulkReview(
					actor,
					filter,
					input,
					visible,
					await readBulkDayState(input.targets, tx)
				);
				if (!timingSafeEqual(Buffer.from(review.version, 'hex'), Buffer.from(input.version, 'hex')))
					throw staleReview();
				if (review.blocked)
					throw new ConflictError('day_state_bulk_blocked', m.daily_bulk_blocked());

				const changed = review.rows
					.filter((row) => row.outcome === 'change')
					.map((row) => ({
						...row,
						state: selected.get(keyOf(row))?.state ?? null,
						newAbsenceId: row.proposed === null ? null : randomUUID()
					}));
				if (!changed.length) return { changed, byDate: new Map<string, typeof changed>() };

				const replaced = Map.groupBy(
					changed.filter((row) => row.state),
					(row) => row.state!.id
				);
				const kept: Parameters<typeof insertAbsences>[0] = [];
				for (const rows of replaced.values()) {
					const original = rows[0].state!;
					for (const part of keepOutsideDates(
						original,
						rows.map((row) => row.shiftDate)
					)) {
						const { staffId, type, reason, recordedBy } = original;
						kept.push({
							id: randomUUID(),
							staffId,
							type,
							reason,
							recordedBy,
							startsOn: part.startsOn,
							endsOn: part.endsOn
						});
					}
				}
				if (replaced.size) {
					const cancelled = await tx.execute(
						cancelActiveDayStates([...replaced.keys()], actor.user.id).getSQL()
					);
					if (cancelled.length !== replaced.size) throw staleReview();
				}
				const inserts = changed.flatMap(({ newAbsenceId, staffId, shiftDate, proposed }) =>
					newAbsenceId && proposed
						? [
								{
									id: newAbsenceId,
									staffId,
									startsOn: shiftDate,
									endsOn: shiftDate,
									type: proposed,
									reason: input.reason,
									recordedBy: actor.user.id
								}
							]
						: []
				);
				const byDate = Map.groupBy(changed, (row) => row.shiftDate);
				const audit = auditInsert({
					actor: actor.user,
					action: 'day_state.bulk',
					entityType: 'day_state_batch',
					entityId: randomUUID(),
					before: changed.map(({ staffId, shiftDate, current, state }) => ({
						staffId,
						shiftDate,
						state: current,
						absenceId: state?.id ?? null
					})),
					after: {
						days: changed.map(({ staffId, shiftDate, proposed, newAbsenceId }) => ({
							staffId,
							shiftDate,
							state: proposed,
							absenceId: newAbsenceId
						})),
						keptAbsenceIds: kept.map((part) => part.id)
					},
					reason: input.operation === 'clear' ? input.reason : null
				});
				const flags = [...byDate]
					.sort(([a], [b]) => a.localeCompare(b))
					.flatMap(([date, rows]) =>
						markNeedsRecompute(
							rows.map((row) => row.staffId),
							date,
							date
						)
					);
				for (const write of [...insertAbsences([...kept, ...inserts]), audit, ...flags])
					await tx.execute(write.getSQL());
				return { changed, byDate };
			},
			{ isolationLevel: 'serializable' }
		)
		.catch((error: unknown) => {
			if (['23P01', '40001', '40P01'].includes(pgErrorCode(error) ?? '')) throw staleReview();
			throw error;
		});

	for (const [date, rows] of applied.byDate) {
		const ids = new Map(rows.map((row) => [row.staffId, row.newAbsenceId ?? row.state!.id]));
		await recomputeAfter([...ids.keys()], date, date, (staffId) =>
			causeBy(actor, 'day_edit', 'absence', ids.get(staffId)!)
		);
	}
	return applied.changed.length;
}
