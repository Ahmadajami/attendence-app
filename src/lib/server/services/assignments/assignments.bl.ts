import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import {
	assignmentImpact,
	planAssignmentChange,
	type AssignmentImpact,
	type AssignmentTarget,
	type ImpactPerson
} from '#lib/roster/assignments.js';
import { addDays, daysBetween, startOfDamascusDay } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import type { RosterAssignment } from '#lib/roster/roster.js';
import type { PatternType } from '#lib/schemas/enums.js';
import type {
	AssignmentInput,
	AssignTargetKind,
	EditFromDateInput,
	EndAssignmentInput,
	PatternBuilderInput
} from '#lib/schemas/pattern.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { descendantIds } from '#lib/workforce/departments.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { listActiveStaffInDepartments, listEventsBetween } from '../attendance/attendance.crud.js';
import { causeBy, markNeedsRecompute, recomputeAfter } from '../day-results/day-results.bl.js';
import { requireEffectiveDate } from '../effective-date.js';
import { findDepartment, listDepartmentRows } from '../departments/departments.crud.js';
import {
	carryStatements,
	createPatternStatements,
	defaultWorkShift,
	requireActiveShifts,
	requirePattern,
	updatePatternDetails
} from '../patterns/patterns.bl.js';
import { loadRosterData, PREVIEW_DAYS, type RosterPerson } from '../roster/roster.bl.js';
import { findRosterPerson, listTeamMembersBetween } from '../roster/roster.crud.js';
import { findTeam } from '../teams/teams.crud.js';
import {
	closeAssignment,
	deleteAssignments,
	insertAssignment,
	listAssignmentsOf,
	listAssignmentsOfPatternBetween,
	listAssignmentsOfPatternFrom,
	type AssignmentRow
} from './assignments.crud.js';

// Who follows a pattern, and from when (builder plan B1–B4, B7–B9, B14). Assign and change with
// `roster.manage`. Assignments never touch punches, overrides or absences (B9).

/** A resolved target with its name, for previews and audit rows. */
export type TargetItem = {
	kind: AssignTargetKind;
	id: string;
	nameEn: string;
	nameAr: string | null;
};

/** The pattern being assigned: saved, or the builder's unsaved draft. */
export type AssignedPattern = {
	type: PatternType;
	slots: (string | null)[];
	/** As chosen in the form (`''`: most used). */
	defaultWorkShiftId: string;
};

export type TargetImpact = TargetItem & { impact: AssignmentImpact };

type Dates = { effectiveFrom: string; anchorDate: string };

const toTarget = (kind: AssignTargetKind, id: string): AssignmentTarget =>
	kind === 'staff'
		? { kind, staffId: id }
		: kind === 'team'
			? { kind, teamId: id }
			: { kind, departmentId: id };

/** A past date is allowed with the reason, up to the backfill limit, until periods exist (B7b). */
const requireFromDate = (date: string) => requireEffectiveDate(date);

/** A cycle needs the date its slot 0 falls on (B4); a weekly pattern has none. */
function anchorFor(type: PatternType, anchorDate: string): string | null {
	if (type !== 'cycle') return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate))
		throw new InvalidInputError('anchor_required', m.roster_date_invalid(), {
			field: 'anchorDate'
		});
	return anchorDate;
}

/** The targets with their names; missing ones are a 404, inactive ones refused unless `allowInactive`. */
async function resolveTargets(
	kind: AssignTargetKind,
	ids: readonly string[],
	allowInactive = false
): Promise<TargetItem[]> {
	const found = await Promise.all(
		[...new Set(ids)].map(async (id) => {
			if (kind === 'staff') {
				const row = await findRosterPerson(id);
				return row && { id, nameEn: row.fullName, nameAr: row.fullNameAr, active: row.active };
			}
			const row = kind === 'team' ? await findTeam(id) : await findDepartment(id);
			return row && { id, nameEn: row.nameEn, nameAr: row.nameAr, active: row.active };
		})
	);
	return found.map((row) => {
		if (!row) throw new NotFoundError(m.assign_error_target_not_found());
		if (!row.active && !allowInactive)
			throw new InvalidInputError('target_inactive', m.assign_error_target_inactive(), {
				field: 'targetIds'
			});
		return { kind, id: row.id, nameEn: row.nameEn, nameAr: row.nameAr };
	});
}

/** Everyone a target can reach over `[from, from + days)`: members, department staff or the person. */
async function peopleOf(
	target: Pick<TargetItem, 'kind' | 'id'>,
	from: string,
	days: number
): Promise<RosterPerson[]> {
	if (target.kind === 'staff') {
		const person = await findRosterPerson(target.id);
		return person ? [{ staffId: person.staffId, departmentId: person.departmentId }] : [];
	}
	if (target.kind === 'team') {
		const rows = await listTeamMembersBetween(
			target.id,
			startOfDamascusDay(from),
			startOfDamascusDay(addDays(from, days))
		);
		return [...new Map(rows.map((r) => [r.staffId, r])).values()].map((r) => ({
			staffId: r.staffId,
			departmentId: r.departmentId
		}));
	}
	const tree = [target.id, ...descendantIds(await listDepartmentRows(), target.id)];
	return (await listActiveStaffInDepartments(tree)).map((r) => ({
		staffId: r.staffId,
		departmentId: r.departmentId
	}));
}

/**
 * Everyone a pattern's assignments may reach on shift dates `[from, to]`: the assigned people, team
 * members and department staff (pay plan PR2, PR8). Candidates only: whether the pattern plans a
 * person's day also depends on the levels above (`rosterDay().patternId` decides).
 */
export async function patternCandidates(
	patternId: string,
	from: string,
	to: string
): Promise<RosterPerson[]> {
	const assignments = await listAssignmentsOfPatternBetween(patternId, from, to);
	const days = daysBetween(from, to) + 1;
	const people = await Promise.all(
		assignments.map((a) =>
			peopleOf(
				a.staffId
					? { kind: 'staff', id: a.staffId }
					: a.teamId
						? { kind: 'team', id: a.teamId }
						: { kind: 'department', id: a.departmentId ?? '' },
				from,
				days
			)
		)
	);
	return [...new Map(people.flat().map((p) => [p.staffId, p])).values()];
}

/**
 * The people whose stored days a change from `from` reaches (pay plan PR17): stored days stop at
 * today (PR18), so a future change reaches none, and a past one (B7b) everyone the targets covered
 * from `from` to today.
 */
async function peopleReached(
	targets: readonly Pick<TargetItem, 'kind' | 'id'>[],
	from: string
): Promise<string[]> {
	const today = todayInDamascus();
	if (from > today) return [];
	const days = daysBetween(from, today) + 1;
	const people = await Promise.all(targets.map((t) => peopleOf(t, from, days)));
	return [...new Set(people.flat().map((p) => p.staffId))];
}

/** Commit an assignment change and recompute the stored days it reaches, `from` to today. */
async function commitAndRecompute(
	actor: Actor,
	statements: readonly BatchQuery[],
	reached: readonly string[],
	from: string
): Promise<void> {
	const today = todayInDamascus();
	try {
		await batch([...statements, ...markNeedsRecompute(reached, from, today)]);
	} catch (error) {
		throw overlapConflict(error) ?? error;
	}
	await recomputeAfter(reached, from, today, causeBy(actor, 'roster_change'));
}

/**
 * What assigning `pattern` to each target from `effectiveFrom` would do, in counts (builder step 3).
 * Nothing is saved.
 */
export async function previewAssign(
	actor: Actor,
	pattern: AssignedPattern,
	input: Dates & { targetKind: AssignTargetKind; targetIds: readonly string[] },
	days: number = PREVIEW_DAYS
): Promise<TargetImpact[]> {
	requireActorPermission(actor, 'roster.manage');
	const anchorDate = anchorFor(pattern.type, input.anchorDate);
	const targets = await resolveTargets(input.targetKind, input.targetIds, true);
	const from = input.effectiveFrom;
	const last = addDays(from, days - 1);

	return Promise.all(
		targets.map(async (target) => {
			const people = await peopleOf(target, from, days);
			const staffIds = people.map((p) => p.staffId);
			const [data, events] = await Promise.all([
				loadRosterData(people, from, days, target.kind === 'team' ? [target.id] : []),
				listEventsBetween(staffIds, from, last)
			]);
			const draft: RosterAssignment = {
				id: 'preview',
				patternId: 'preview',
				teamId: target.kind === 'team' ? target.id : null,
				departmentId: target.kind === 'department' ? target.id : null,
				type: pattern.type,
				slots: pattern.slots,
				defaultWorkShiftId: defaultWorkShift(
					pattern.type,
					pattern.slots,
					pattern.defaultWorkShiftId
				),
				anchorDate,
				effectiveFrom: from,
				effectiveTo: null
			};
			const impactPeople: ImpactPerson[] = staffIds.map((staffId) => ({
				staffId,
				input: rosterInputOf(data, staffId),
				punchedDates: events.filter((e) => e.staffId === staffId).map((e) => e.shiftDate)
			}));
			const impact = assignmentImpact(
				impactPeople,
				toTarget(target.kind, target.id),
				draft,
				from,
				days
			);
			return { ...target, impact };
		})
	);
}

function overlapConflict(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) !== '23P01') return undefined;
	return new ConflictError('assignment_overlap', m.roster_error_overlap(), { cause: error });
}

/** Removals and the close first, then the insert (for the `EXCLUDE`). */
function changeStatements(
	existing: readonly AssignmentRow[],
	target: AssignmentTarget,
	from: string
): { statements: BatchQuery[]; closed: AssignmentRow | null; removed: AssignmentRow[] } {
	const { closed, removed } = planAssignmentChange(existing, target, from);
	return {
		closed,
		removed,
		statements: [
			...(removed.length > 0 ? [deleteAssignments(removed.map((a) => a.id))] : []),
			...(closed ? [closeAssignment(closed.id, from)] : [])
		]
	};
}

/**
 * The statements that assign pattern `patternId` to each target from `effectiveFrom`, closing or
 * replacing what each target had (one audit row per target). For `assign` and the builder, which
 * creates the pattern in the same batch.
 */
export async function assignStatements(
	actor: Actor,
	pattern: { id: string; type: PatternType },
	input: Omit<AssignmentInput, 'patternId'>
): Promise<BatchQuery[]> {
	requireActorPermission(actor, 'roster.manage');
	requireFromDate(input.effectiveFrom);
	const anchorDate = anchorFor(pattern.type, input.anchorDate);
	const targets = await resolveTargets(input.targetKind, input.targetIds);
	const existing = await listAssignmentsOf(
		input.targetKind,
		targets.map((t) => t.id)
	);
	return targets.flatMap((item) => {
		const target = toTarget(item.kind, item.id);
		const { statements, closed, removed } = changeStatements(existing, target, input.effectiveFrom);
		const values = {
			id: randomUUID(),
			patternId: pattern.id,
			staffId: item.kind === 'staff' ? item.id : null,
			teamId: item.kind === 'team' ? item.id : null,
			departmentId: item.kind === 'department' ? item.id : null,
			anchorDate,
			effectiveFrom: input.effectiveFrom,
			effectiveTo: null,
			reason: input.reason,
			createdBy: actor.user.id
		};
		return [
			...statements,
			insertAssignment(values),
			auditInsert({
				actor: actor.user,
				action: 'pattern_assignment.set',
				entityType: item.kind,
				entityId: item.id,
				before: { closed: closed?.id ?? null, removed },
				after: values,
				reason: input.reason
			})
		];
	});
}

/** Assign a saved, active pattern to several targets of one kind from a date, in one batch. */
export async function assign(actor: Actor, input: AssignmentInput): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	const pattern = await requirePattern(input.patternId);
	if (!pattern.active)
		throw new InvalidInputError('pattern_inactive', m.patterns_error_inactive(), {
			field: 'patternId'
		});
	const statements = await assignStatements(actor, pattern, input);
	const reached = await peopleReached(
		input.targetIds.map((id) => ({ kind: input.targetKind, id })),
		input.effectiveFrom
	);
	await commitAndRecompute(actor, statements, reached, input.effectiveFrom);
}

/** Stop a target's assignment from a date; from then the next level (team, department) applies. */
export async function endAssignment(actor: Actor, input: EndAssignmentInput): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	requireFromDate(input.effectiveFrom);
	const [item] = await resolveTargets(input.targetKind, [input.targetId], true);
	const target = toTarget(item.kind, item.id);
	const { statements, closed, removed } = changeStatements(
		await listAssignmentsOf(item.kind, [item.id]),
		target,
		input.effectiveFrom
	);
	if (statements.length === 0)
		throw new InvalidInputError('nothing_to_end', m.assign_error_nothing_to_end(), {
			field: 'effectiveFrom'
		});
	await commitAndRecompute(
		actor,
		[
			...statements,
			auditInsert({
				actor: actor.user,
				action: 'pattern_assignment.end',
				entityType: item.kind,
				entityId: item.id,
				before: { closed: closed?.id ?? null, removed },
				after: { effectiveTo: input.effectiveFrom },
				reason: input.reason
			})
		],
		await peopleReached([item], input.effectiveFrom),
		input.effectiveFrom
	);
}

/**
 * Change a used pattern from a date (B3): save a copy with the new days, and move every assignment
 * of the old pattern in force on or after `effectiveFrom` to the copy from then (scheduled ones keep
 * their own dates). Days before stay as they were. The copy keeps the pay rule and upcoming holidays
 * from that date (pay plan PR14). One batch.
 */
export async function editFromDate(actor: Actor, input: EditFromDateInput): Promise<string> {
	requireActorPermission(actor, 'roster.manage');
	const old = await requirePattern(input.patternId);
	if (old.type !== input.type)
		throw new InvalidInputError('type_changed', m.patterns_error_type_changed(), { field: 'type' });
	requireFromDate(input.effectiveFrom);
	await requireActiveShifts([...input.slots, input.defaultWorkShiftId || null]);
	const from = input.effectiveFrom;
	const moving = await listAssignmentsOfPatternFrom(old.id, from);
	if (moving.length === 0)
		throw new InvalidInputError('nothing_follows', m.patterns_error_nothing_follows(), {
			field: 'effectiveFrom'
		});

	const reached = await peopleReached(
		moving.map((a) =>
			a.staffId
				? { kind: 'staff' as const, id: a.staffId }
				: a.teamId
					? { kind: 'team' as const, id: a.teamId }
					: { kind: 'department' as const, id: a.departmentId ?? '' }
		),
		from
	);
	const copyId = randomUUID();
	// The copy keeps the pay rule and upcoming holidays from `from` (pay plan PR14).
	const carry = await carryStatements(actor, old.id, copyId, from);
	const scheduled = moving.filter((a) => a.effectiveFrom >= from);
	const current = moving.filter((a) => a.effectiveFrom < from);
	const moved = moving.map((a) => ({
		id: randomUUID(),
		patternId: copyId,
		staffId: a.staffId,
		teamId: a.teamId,
		departmentId: a.departmentId,
		anchorDate: a.anchorDate,
		effectiveFrom: a.effectiveFrom < from ? from : a.effectiveFrom,
		effectiveTo: a.effectiveTo,
		reason: input.reason,
		createdBy: actor.user.id
	}));

	try {
		await batch([
			...createPatternStatements(
				actor,
				copyId,
				{
					nameEn: input.nameEn,
					nameAr: input.nameAr,
					type: input.type,
					slots: input.slots,
					defaultWorkShiftId: input.defaultWorkShiftId
				},
				'pattern.edit_from_date'
			),
			...carry,
			...(scheduled.length > 0 ? [deleteAssignments(scheduled.map((a) => a.id))] : []),
			...current.map((a) => closeAssignment(a.id, from)),
			...moved.map((values) => insertAssignment(values)),
			...moving.map((a, i) =>
				auditInsert({
					actor: actor.user,
					action: 'pattern_assignment.move',
					entityType: a.staffId ? 'staff' : a.teamId ? 'team' : 'department',
					entityId: a.staffId ?? a.teamId ?? a.departmentId ?? '',
					before: { assignment: a.id, patternId: old.id },
					after: moved[i],
					reason: input.reason
				})
			),
			...markNeedsRecompute(reached, from, todayInDamascus())
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('duplicate_name', m.patterns_error_duplicate(), {
				field: 'nameEn',
				cause: error
			});
		throw overlapConflict(error) ?? error;
	}
	await recomputeAfter(reached, from, todayInDamascus(), causeBy(actor, 'roster_change'));
	return copyId;
}

/**
 * The builder's save (builder plan 4.2): create the pattern, or edit an unused one (B3), and when
 * `assign` is on, assign it. A new pattern and its assignments are one batch. Returns the id.
 */
export async function buildPattern(actor: Actor, input: PatternBuilderInput): Promise<string> {
	requireActorPermission(actor, 'roster.manage');
	const fields = {
		nameEn: input.nameEn,
		nameAr: input.nameAr,
		type: input.type,
		slots: input.slots,
		defaultWorkShiftId: input.defaultWorkShiftId
	};
	const assignment = {
		targetKind: input.targetKind,
		targetIds: input.targetIds,
		effectiveFrom: input.effectiveFrom,
		anchorDate: input.anchorDate,
		reason: input.reason
	};

	if (input.patternId) {
		const saved = await updatePatternDetails(actor, input.patternId, fields);
		if (input.assign) await assign(actor, { patternId: saved.id, ...assignment });
		return saved.id;
	}

	await requireActiveShifts([...input.slots, input.defaultWorkShiftId || null]);
	const id = randomUUID();
	const statements = [
		...createPatternStatements(actor, id, fields),
		...(input.assign ? await assignStatements(actor, { id, type: input.type }, assignment) : [])
	];
	const reached = input.assign
		? await peopleReached(
				input.targetIds.map((targetId) => ({ kind: input.targetKind, id: targetId })),
				input.effectiveFrom
			)
		: [];
	try {
		await batch([
			...statements,
			...markNeedsRecompute(reached, input.effectiveFrom, todayInDamascus())
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('duplicate_name', m.patterns_error_duplicate(), {
				field: 'nameEn',
				cause: error
			});
		throw overlapConflict(error) ?? error;
	}
	await recomputeAfter(
		reached,
		input.effectiveFrom,
		todayInDamascus(),
		causeBy(actor, 'roster_change')
	);
	return id;
}

/** The assignment each of these targets has on `date` (pattern id and start), for list columns. */
export async function currentAssignments(
	actor: Actor,
	kind: AssignTargetKind,
	ids: readonly string[],
	date: string = todayInDamascus()
): Promise<Map<string, { patternId: string; effectiveFrom: string }>> {
	requireActorPermission(actor, 'staff.write');
	const rows = await listAssignmentsOf(kind, ids);
	const result = new Map<string, { patternId: string; effectiveFrom: string }>();
	for (const row of rows) {
		const id = row.staffId ?? row.teamId ?? row.departmentId;
		if (id && row.effectiveFrom <= date && (row.effectiveTo === null || date < row.effectiveTo))
			result.set(id, { patternId: row.patternId, effectiveFrom: row.effectiveFrom });
	}
	return result;
}
