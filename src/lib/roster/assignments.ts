// Assignment changes, their effect on people before saving, and staffing counts (builder plan task
// 2.4). Pure: the services and the builder's step-3 preview use the same functions. Client-safe.

import { addDays } from './cycle.js';
import {
	patternOn,
	rosterRange,
	teamOnDate,
	type RosterAssignment,
	type RosterDay,
	type RosterInput
} from './roster.js';
import { applyVersionChange, planVersionChange } from './versions.js';

/** Who an assignment is for: exactly one of a person, a team or a department. */
export type AssignmentTarget =
	| { kind: 'staff'; staffId: string }
	| { kind: 'team'; teamId: string }
	| { kind: 'department'; departmentId: string };

/** A personal assignment carries its person; team and department ones carry their ids already. */
type Targeted = RosterAssignment & { staffId?: string | null };

function isFor(assignment: Targeted, target: AssignmentTarget): boolean {
	if (target.kind === 'staff') return assignment.staffId === target.staffId;
	if (target.kind === 'team') return assignment.teamId === target.teamId;
	return assignment.departmentId === target.departmentId;
}

/**
 * What assigning a pattern to `target` from `from` does to that target's assignments (the
 * `versions.ts` rule, per target): `closed` ends at `from`, `removed` (starting on or after `from`)
 * are replaced. Other targets' assignments are untouched.
 */
export function planAssignmentChange<T extends Targeted>(
	assignments: readonly T[],
	target: AssignmentTarget,
	from: string
): { closed: T | null; removed: T[] } {
	return planVersionChange(
		assignments.filter((a) => isFor(a, target)),
		from
	);
}

/** `assignments` once `next` is saved for `target` (for previews). */
export function applyAssignmentChange<T extends Targeted>(
	assignments: readonly T[],
	target: AssignmentTarget,
	next: T
): T[] {
	return [
		...assignments.filter((a) => !isFor(a, target)),
		...applyVersionChange(
			assignments.filter((a) => isFor(a, target)),
			next
		)
	];
}

/** One person the preview counts: their roster input, and the dates they already have punches on. */
export type ImpactPerson = {
	staffId: string;
	input: RosterInput;
	punchedDates?: readonly string[];
};

/**
 * What a new assignment would do to `people` over `days` days from `from`, in counts (builder step
 * 3, e.g. "Applies to 12 of 14. 1 has an own pattern, which still wins. 2 keep their own off days."):
 * - `applies`: people with at least one day it plans;
 * - `ownPattern`: people whose own (personal) assignment wins on some day of the target's coverage;
 * - `ownOffDays` / `crewStarts`: people it applies to whose own off days (weekly) or crew start
 *   (cycle, ≠ 0) adjust its days;
 * - `notMembers`: people the target doesn't cover on any day (not in the team or department);
 * - `overrideDays` / `absenceDays` / `punchedDays`: days it plans that an override, an absence or
 *   existing punches already speak for (they are kept, B9).
 */
export function assignmentImpact(
	people: readonly ImpactPerson[],
	target: AssignmentTarget,
	assignment: RosterAssignment,
	from: string,
	days: number
) {
	const impact = {
		people: people.length,
		applies: 0,
		ownPattern: 0,
		ownOffDays: 0,
		crewStarts: 0,
		notMembers: 0,
		overrideDays: 0,
		absenceDays: 0,
		punchedDays: 0
	};
	const dates = Array.from({ length: days }, (_, i) => addDays(from, i));

	for (const person of people) {
		const input = withAssignment(person, target, assignment);
		const covered = dates.filter((date) => covers(person, input, target, date));
		if (covered.length === 0) {
			impact.notMembers++;
			continue;
		}
		if (target.kind !== 'staff' && covered.some((d) => patternOn(input.personalAssignments, d)))
			impact.ownPattern++;

		const planned = rosterRange(input, from, days).filter((d) => d.assignmentId === assignment.id);
		if (planned.length === 0) continue;
		impact.applies++;
		if (planned.some((d) => d.adjustment !== null)) impact.ownOffDays++;
		if (
			assignment.type === 'cycle' &&
			target.kind !== 'staff' &&
			planned.some((d) => (patternOn(input.schedules, d.date)?.crewStart ?? 0) !== 0)
		)
			impact.crewStarts++;
		const punched = new Set(person.punchedDates ?? []);
		impact.overrideDays += planned.filter((d) => d.source === 'override').length;
		impact.absenceDays += planned.filter((d) => d.source === 'absence').length;
		impact.punchedDays += planned.filter((d) => punched.has(d.date)).length;
	}
	return impact;
}

export type AssignmentImpact = ReturnType<typeof assignmentImpact>;

function withAssignment(
	person: ImpactPerson,
	target: AssignmentTarget,
	assignment: RosterAssignment
): RosterInput {
	const { input } = person;
	if (target.kind === 'staff')
		return {
			...input,
			personalAssignments: applyAssignmentChange(
				input.personalAssignments.map((a) => ({ ...a, staffId: person.staffId })),
				target,
				{ ...assignment, staffId: target.staffId }
			)
		};
	if (target.kind === 'team')
		return {
			...input,
			teamAssignments: applyAssignmentChange(input.teamAssignments, target, assignment)
		};
	return {
		...input,
		departmentAssignments: applyAssignmentChange(input.departmentAssignments, target, assignment)
	};
}

/** Whether `target` reaches the person on `date` (membership dates for a team, B8). */
function covers(
	person: ImpactPerson,
	input: RosterInput,
	target: AssignmentTarget,
	date: string
): boolean {
	if (target.kind === 'staff') return target.staffId === person.staffId;
	if (target.kind === 'team') return teamOnDate(input.memberships, date) === target.teamId;
	return input.departmentChain.includes(target.departmentId);
}

/** One date's staffing: people per shift id, off and absent (B15: counts only). */
export type Staffing = {
	date: string;
	shifts: Record<string, number>;
	off: number;
	/** Off because of a holiday of their pattern (pay plan PR8), counted apart from `off`. */
	holiday: number;
	absent: number;
};

/** Per date, how many of these roster days are on each shift, off, on holiday or absent (the strip). */
export function staffing(rosterDays: readonly RosterDay[]): Staffing[] {
	const byDate = new Map<string, Staffing>();
	for (const day of rosterDays) {
		let entry = byDate.get(day.date);
		if (!entry) {
			entry = { date: day.date, shifts: {}, off: 0, holiday: 0, absent: 0 };
			byDate.set(day.date, entry);
		}
		if (day.source === 'absence') entry.absent++;
		else if (day.shiftId === null && day.holiday) entry.holiday++;
		else if (day.shiftId === null) entry.off++;
		else entry.shifts[day.shiftId] = (entry.shifts[day.shiftId] ?? 0) + 1;
	}
	return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
