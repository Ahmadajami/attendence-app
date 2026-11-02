import { addDays } from '#lib/roster/cycle.js';
import type { AbsenceType } from '#lib/schemas/enums.js';

// The yearly leave balance (pay plan PR30–PR33). Pure: the leave service loads the entitlement, the
// person's `leave` absences and their roster, and asks which leave dates were planned work days.

/** A person's `leave_entitlement` row for the year (`null`: none set yet). */
export type Entitlement = { days: number; carriedDays: number };

export type LeaveBalance = {
	/** Yearly days granted. */
	yearly: number;
	/** Carried from last year (negative when last year went below zero). */
	carried: number;
	/** Leave days on planned work days, up to and including today. */
	taken: number;
	/** Leave days on planned work days after today. */
	booked: number;
	/** yearly + carried − taken − booked; below zero is allowed (a warning, PR33). */
	left: number;
};

/** Two decimals, so 0.1 + 0.2 sums never show as 0.30000000000000004. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every date of the year a `leave` absence covers (PR31: sick, mission and the others never count),
 * clipped to 1 January – 31 December, without duplicates, in order.
 */
export function leaveDatesInYear(
	absences: readonly { startsOn: string; endsOn: string; type: AbsenceType }[],
	year: number
): string[] {
	const first = `${year}-01-01`;
	const last = `${year}-12-31`;
	const dates = new Set<string>();
	for (const a of absences) {
		if (a.type !== 'leave') continue;
		const from = a.startsOn > first ? a.startsOn : first;
		const to = a.endsOn < last ? a.endsOn : last;
		for (let d = from; d <= to; d = addDays(d, 1)) dates.add(d);
	}
	return [...dates].sort();
}

/**
 * The balance from the leave dates and whether each was a planned work day (off days and holidays
 * inside a leave don't count, PR31).
 */
export function leaveBalance(
	entitlement: Entitlement | null,
	leaveDays: readonly { date: string; plannedWork: boolean }[],
	today: string
): LeaveBalance {
	const yearly = entitlement?.days ?? 0;
	const carried = entitlement?.carriedDays ?? 0;
	let taken = 0;
	let booked = 0;
	for (const day of leaveDays) {
		if (!day.plannedWork) continue;
		if (day.date <= today) taken++;
		else booked++;
	}
	return { yearly, carried, taken, booked, left: round2(yearly + carried - taken - booked) };
}

/** What to carry into the next year (PR32): last year's days left; HR may change it. */
export function suggestCarry(previous: LeaveBalance | null): number {
	return previous ? previous.left : 0;
}
