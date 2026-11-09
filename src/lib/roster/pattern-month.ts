import { parseDate } from '@internationalized/date';
import { addDays, daysBetween } from './cycle.js';
import { rosterInputOf, type RosterData } from './input.js';
import { patternOn, rosterDay, type RosterDay } from './roster.js';

// One calendar month of a pattern (plans/2026-11-09-operations-roster-nov-2026.md RO13, 6.1): who
// it was assigned to, whose days it actually planned (the engine decides: `rosterDay().patternId`),
// and what happened on each day. Pure: the pattern page's loader and Vitest share it.

/** `YYYY-MM` with a real month. */
export function isMonth(value: string): boolean {
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The month `delta` months from `month`. */
export function addMonths(month: string, delta: number): string {
	return parseDate(`${month}-01`).add({ months: delta }).toString().slice(0, 7);
}

/** Every date of the month, `YYYY-MM-DD`. */
export function monthDates(month: string): string[] {
	const first = `${month}-01`;
	const days = daysBetween(first, `${addMonths(month, 1)}-01`);
	return Array.from({ length: days }, (_, i) => addDays(first, i));
}

/** An assignment of the pattern (`effectiveTo` exclusive, `null` open). */
export type MonthTargetInput = { effectiveFrom: string; effectiveTo: string | null };

/** The assignment with its dates inside the month (`from`, `to` both inclusive). */
export type MonthTarget<T> = T & { from: string; to: string };

export type MonthFollower = {
	staffId: string;
	/** Every day of the month (the grid). */
	days: RosterDay[];
	/** Days the pattern planned. */
	plannedDays: number;
	firstDate: string;
	lastDate: string;
	/** Crew starts in force on those days (inherited plans; empty under a personal one). */
	crewStarts: number[];
	/** Days an approved swap moved, and one-off day edits, among the planned days. */
	swapDates: string[];
	editedDates: string[];
};

/** What the followers had on one date: the shift each really works (by code), off, absent. */
export type MonthDayCount = {
	date: string;
	shifts: Record<string, number>;
	off: number;
	absent: number;
};

export type PatternMonth<T> = {
	month: string;
	dates: string[];
	targets: MonthTarget<T>[];
	followers: MonthFollower[];
	counts: MonthDayCount[];
};

/**
 * The month of `patternId` for its candidates (`data` loaded for the month's dates): the targets
 * clipped to the month, the people whose days it planned on at least one date, and per-day counts
 * over those people on the dates it planned them.
 */
export function patternMonth<T extends MonthTargetInput>(
	patternId: string,
	month: string,
	targets: readonly T[],
	data: RosterData,
	staffIds: readonly string[]
): PatternMonth<T> {
	const dates = monthDates(month);
	const first = dates[0];
	const last = dates[dates.length - 1];

	const clipped = targets
		.filter((t) => t.effectiveFrom <= last && (t.effectiveTo === null || t.effectiveTo > first))
		.map((t) => {
			const end = t.effectiveTo === null ? last : addDays(t.effectiveTo, -1);
			return {
				...t,
				from: t.effectiveFrom > first ? t.effectiveFrom : first,
				to: end < last ? end : last
			};
		});

	const counts: MonthDayCount[] = dates.map((date) => ({ date, shifts: {}, off: 0, absent: 0 }));
	const followers: MonthFollower[] = [];
	for (const staffId of staffIds) {
		const input = rosterInputOf(data, staffId);
		const days = dates.map((date) => rosterDay(input, date));
		const planned = days.filter((day) => day.patternId === patternId);
		if (planned.length === 0) continue;

		const personal = new Set(input.personalAssignments.map((a) => a.id));
		const crewStarts = new Set<number>();
		for (const day of planned) {
			if (day.assignmentId !== null && !personal.has(day.assignmentId))
				crewStarts.add(patternOn(input.schedules, day.date)?.crewStart ?? 0);
			const count = counts[dates.indexOf(day.date)];
			if (day.source === 'absence') count.absent += 1;
			else if (day.shift) count.shifts[day.shift.code] = (count.shifts[day.shift.code] ?? 0) + 1;
			else count.off += 1;
		}
		followers.push({
			staffId,
			days,
			plannedDays: planned.length,
			firstDate: planned[0].date,
			lastDate: planned[planned.length - 1].date,
			crewStarts: [...crewStarts].sort((a, b) => a - b),
			swapDates: planned.filter((d) => d.swapGroupId !== null).map((d) => d.date),
			editedDates: planned
				.filter((d) => d.source === 'override' && d.swapGroupId === null)
				.map((d) => d.date)
		});
	}
	return { month, dates, targets: clipped, followers, counts };
}
