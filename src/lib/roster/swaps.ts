import type { SwapKind, SwapScope } from '#lib/schemas/enums.js';
import { addDays, weekdayOf } from './cycle.js';
import type { RosterDay } from './roster.js';

// Self swaps, employee swaps (pay plan PR25–PR28, BRIEF R12 / §9.6) and shift changes (plan
// 2026-11-11-shift-change-request: one person, one work day, another shift). Pure: the swap service
// loads the people's roster days and calls `checkSwap` when the request is made and again when it is
// approved, then writes the `swapOverrides` rows with `swap_group_id` = the request id.

export type SwapPlan = {
	kind: SwapKind;
	/** A: the person who asks. */
	staffId: string;
	/** Employee swap: B. */
	otherStaffId: string | null;
	/** Self: the work day W that becomes off. Employee: the date D (A works, B is off). */
	firstDate: string;
	/** Self: the off day O that becomes work (required). Employee: the optional return date D2. */
	secondDate: string | null;
	scope: SwapScope;
	/** Shift change: the shift A works on `firstDate` instead of the planned one. */
	shiftId: string | null;
};

/** What the check needs of a roster day. */
export type SwapDay = Pick<RosterDay, 'shiftId' | 'source' | 'holiday' | 'swapGroupId'>;

export type SwapIssue =
	| 'same_date'
	| 'scope'
	| 'missing_date'
	| 'a_not_working'
	| 'a_not_off'
	| 'b_not_working'
	| 'b_not_off'
	| 'o_not_off'
	| 'absence'
	| 'override'
	| 'holiday'
	| 'inactive'
	| 'missing_shift'
	| 'same_shift';

/** Sunday of the week (Sun–Sat, plan Q-A8) that holds `date`. */
export function weekStart(date: string): string {
	return addDays(date, -weekdayOf(date));
}

/** Both dates in the same Sunday–Saturday week, or the same calendar month. */
export function sameScope(a: string, b: string, scope: SwapScope): boolean {
	return scope === 'week' ? weekStart(a) === weekStart(b) : a.slice(0, 7) === b.slice(0, 7);
}

/** The person-dates a swap touches. */
export function swapDates(plan: SwapPlan): { staffId: string; date: string }[] {
	const dates = [plan.firstDate, ...(plan.secondDate ? [plan.secondDate] : [])];
	const people = [plan.staffId, ...(plan.otherStaffId ? [plan.otherStaffId] : [])];
	return people.flatMap((staffId) => dates.map((date) => ({ staffId, date })));
}

/**
 * Why a swap cannot apply, in a fixed order; empty when it can. `dayOf` gives a person's roster day
 * (`undefined` when not loaded: treated as not working). `active` lists the active people.
 * `swapId` (on approval) lets the swap's own overrides through.
 */
export function checkSwap(
	plan: SwapPlan,
	dayOf: (staffId: string, date: string) => SwapDay | undefined,
	active: ReadonlySet<string>,
	swapId: string | null = null
): SwapIssue[] {
	const issues = new Set<SwapIssue>();
	const { kind, staffId: a, otherStaffId: b, firstDate, secondDate } = plan;

	if (kind === 'self_swap' && secondDate === null) issues.add('missing_date');
	if (secondDate !== null && secondDate === firstDate) issues.add('same_date');
	if (secondDate !== null && !sameScope(firstDate, secondDate, plan.scope)) issues.add('scope');
	if (!active.has(a) || (kind === 'emp_swap' && (b === null || !active.has(b))))
		issues.add('inactive');

	const works = (who: string, date: string) => (dayOf(who, date)?.shiftId ?? null) !== null;
	if (kind === 'shift_change') {
		// SC2: a planned work day, to another shift.
		if (plan.shiftId === null) issues.add('missing_shift');
		if (!works(a, firstDate)) issues.add('a_not_working');
		else if (plan.shiftId !== null && dayOf(a, firstDate)?.shiftId === plan.shiftId)
			issues.add('same_shift');
	} else if (kind === 'self_swap') {
		if (!works(a, firstDate)) issues.add('a_not_working');
		if (secondDate !== null && works(a, secondDate)) issues.add('o_not_off');
	} else if (b !== null) {
		if (!works(a, firstDate)) issues.add('a_not_working');
		if (works(b, firstDate)) issues.add('b_not_off');
		if (secondDate !== null) {
			if (!works(b, secondDate)) issues.add('b_not_working');
			if (works(a, secondDate)) issues.add('a_not_off');
		}
	}

	for (const { staffId, date } of swapDates(plan)) {
		const day = dayOf(staffId, date);
		if (!day) continue;
		if (day.source === 'absence') issues.add('absence');
		else if (day.source === 'override' && (swapId === null || day.swapGroupId !== swapId))
			issues.add('override');
		if (day.holiday) issues.add('holiday');
	}
	return [...issues];
}

export type SwapOverride = { staffId: string; shiftDate: string; shiftId: string | null };

/**
 * The one-off shifts an approved swap creates (R12). Self: W off, O works W's shift. Employee: on D
 * A is off and B works A's shift; on D2 B is off and A works B's shift. Shift change: A works the
 * new shift on the date (SC3). Call only when `checkSwap` found nothing.
 */
export function swapOverrides(
	plan: SwapPlan,
	dayOf: (staffId: string, date: string) => SwapDay | undefined
): SwapOverride[] {
	const shiftOf = (who: string, date: string) => dayOf(who, date)?.shiftId ?? null;
	const { staffId: a, otherStaffId: b, firstDate, secondDate } = plan;
	if (plan.kind === 'shift_change')
		return plan.shiftId === null
			? []
			: [{ staffId: a, shiftDate: firstDate, shiftId: plan.shiftId }];
	if (plan.kind === 'self_swap') {
		if (secondDate === null) return [];
		return [
			{ staffId: a, shiftDate: firstDate, shiftId: null },
			{ staffId: a, shiftDate: secondDate, shiftId: shiftOf(a, firstDate) }
		];
	}
	if (b === null) return [];
	const rows: SwapOverride[] = [
		{ staffId: a, shiftDate: firstDate, shiftId: null },
		{ staffId: b, shiftDate: firstDate, shiftId: shiftOf(a, firstDate) }
	];
	if (secondDate !== null)
		rows.push(
			{ staffId: b, shiftDate: secondDate, shiftId: null },
			{ staffId: a, shiftDate: secondDate, shiftId: shiftOf(b, secondDate) }
		);
	return rows;
}
