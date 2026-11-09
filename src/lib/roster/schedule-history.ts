import { addDays, damascusDate, startOfDamascusDay } from './cycle.js';
import { patternOn, rosterDay, type RosterInput, type RosterSchedule } from './roster.js';

// A person's schedule history (plans/2026-11-09-operations-roster-nov-2026.md RO12, 5.1): the
// periods in which neither the plan nor the person's own rules change. Each period is worked out
// with the engine itself (`rosterDay`, same precedence: personal → team → department, B6), so the
// history says what the roster did. Swaps are one-off days and stay out of it (the page lists them
// under the period they fall in). Pure: shared by the loader and Vitest.

/** An own-rule version with its reason. */
export type HistorySchedule = RosterSchedule & { reason: string | null };

export type HistoryInput = Pick<
	RosterInput,
	| 'memberships'
	| 'personalAssignments'
	| 'teamAssignments'
	| 'departmentAssignments'
	| 'departmentChain'
> & { schedules: readonly HistorySchedule[] };

export type SchedulePeriod = {
	from: string;
	/** Exclusive; `null` while open. */
	to: string | null;
	/** Who plans the days: `none` = in no plan (a team without a pattern, or no team). */
	source: 'personal' | 'team' | 'department' | 'none';
	/** The team on these dates (`null`: none). */
	teamId: string | null;
	/** The department whose assignment plans the days (`source: 'department'`). */
	departmentId: string | null;
	assignmentId: string | null;
	patternId: string | null;
	anchorDate: string | null;
	/** Own rules in force (team or department plans only). */
	crewStart: number | null;
	offWeekdays: number[] | null;
	ruleReason: string | null;
};

/** The first date whose 00:00 Damascus is at or after `at` (the first day a membership covers). */
function firstDayFrom(at: Date): string {
	const day = damascusDate(at);
	return startOfDamascusDay(day).getTime() >= at.getTime() ? day : addDays(day, 1);
}

const NO_SHIFTS = new Map();

function stateOn(input: HistoryInput, date: string): Omit<SchedulePeriod, 'from' | 'to'> {
	const day = rosterDay(
		{ ...input, overrides: [], absences: [], shifts: NO_SHIFTS, holidays: [] },
		date
	);
	const lists = [
		...input.personalAssignments,
		...input.teamAssignments,
		...input.departmentAssignments
	];
	const assignment = day.assignmentId ? lists.find((a) => a.id === day.assignmentId) : undefined;
	const source =
		day.source === 'personal' || day.source === 'team' || day.source === 'department'
			? day.source
			: 'none';
	const own =
		source === 'team' || source === 'department' ? patternOn(input.schedules, date) : undefined;
	const rules = own && (own.crewStart !== null || own.offWeekdays !== null) ? own : undefined;
	return {
		source,
		teamId: day.teamId,
		departmentId: source === 'department' ? (assignment?.departmentId ?? null) : null,
		assignmentId: day.assignmentId,
		patternId: day.patternId,
		anchorDate: assignment?.anchorDate ?? null,
		crewStart: rules?.crewStart ?? null,
		offWeekdays: rules?.offWeekdays ? [...rules.offWeekdays] : null,
		ruleReason: rules?.reason ?? null
	};
}

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
const isEmpty = (s: Omit<SchedulePeriod, 'from' | 'to'>) =>
	s.source === 'none' && s.teamId === null;

/** The periods, newest first. Days before the first plan or team are left out. */
export function scheduleHistory(input: HistoryInput): SchedulePeriod[] {
	const dates = new Set<string>();
	for (const m of input.memberships) {
		dates.add(firstDayFrom(m.validFrom));
		if (m.validTo) dates.add(firstDayFrom(m.validTo));
	}
	for (const v of [
		...input.personalAssignments,
		...input.teamAssignments,
		...input.departmentAssignments,
		...input.schedules
	]) {
		dates.add(v.effectiveFrom);
		if (v.effectiveTo) dates.add(v.effectiveTo);
	}

	const periods: SchedulePeriod[] = [];
	for (const date of [...dates].sort()) {
		const state = stateOn(input, date);
		const last = periods.at(-1);
		if (last) {
			// Same key order on both sides (`from`, `to`, then the state), so JSON compares fields.
			if (same({ ...last, from: '', to: null }, { from: '', to: null, ...state })) continue;
			last.to = date;
		} else if (isEmpty(state)) continue;
		// A trailing empty state stays: it says from when nothing plans the days.
		periods.push({ from: date, to: null, ...state });
	}
	return periods.reverse();
}

/** True when `date` falls in the period. */
export function inPeriod(period: Pick<SchedulePeriod, 'from' | 'to'>, date: string): boolean {
	return date >= period.from && (period.to === null || date < period.to);
}
