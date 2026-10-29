import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import {
	assignmentImpact,
	planAssignmentChange,
	type AssignmentImpact,
	type AssignmentTarget,
	type ImpactPerson
} from '#lib/roster/assignments.js';
import { addDays, startOfDamascusDay } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import type { RosterAssignment } from '#lib/roster/roster.js';
import type { PatternType } from '#lib/schemas/enums.js';
import type {
	AssignmentInput,
	AssignTargetKind,
	EditFromDateInput,
	EndAssignmentInput
} from '#lib/schemas/pattern.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { descendantIds } from '#lib/workforce/departments.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { listActiveStaffInDepartments, listEventsBetween } from '../attendance/attendance.crud.js';
import { findDepartment, listDepartmentRows } from '../departments/departments.crud.js';
import {
	createPatternStatements,
	defaultWorkShift,
	requireActiveShifts,
	requirePattern
} from '../patterns/patterns.bl.js';
import { loadRosterData, PREVIEW_DAYS, type RosterPerson } from '../roster/roster.bl.js';
import { findRosterPerson, listTeamMembersBetween } from '../roster/roster.crud.js';
import { findTeam } from '../teams/teams.crud.js';
import {
	closeAssignment,
	deleteAssignments,
	insertAssignment,
	listAssignmentsOf,
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

/** Today or later until periods exist (B7). */
function requireFromDate(date: string): void {
	if (date < todayInDamascus())
		throw new InvalidInputError('effective_past', m.roster_error_effective_past(), {
			field: 'effectiveFrom'
		});
}

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
async function peopleOf(target: TargetItem, from: string, days: number): Promise<RosterPerson[]> {
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
				before: { closed: closed?.id ?? null, removed: removed.map((a) => a.id) },
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
	try {
		await batch(statements);
	} catch (error) {
		throw overlapConflict(error) ?? error;
	}
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
	try {
		await batch([
			...statements,
			auditInsert({
				actor: actor.user,
				action: 'pattern_assignment.end',
				entityType: item.kind,
				entityId: item.id,
				before: { closed: closed?.id ?? null, removed: removed.map((a) => a.id) },
				after: { effectiveTo: input.effectiveFrom },
				reason: input.reason
			})
		]);
	} catch (error) {
		throw overlapConflict(error) ?? error;
	}
}

/**
 * Change a used pattern from a date (B3): save a copy with the new days, and move every assignment
 * of the old pattern in force on or after `effectiveFrom` to the copy from then (scheduled ones keep
 * their own dates). Days before stay as they were. One batch.
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

	const copyId = randomUUID();
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
			)
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('duplicate_name', m.patterns_error_duplicate(), {
				field: 'nameEn',
				cause: error
			});
		throw overlapConflict(error) ?? error;
	}
	return copyId;
}
