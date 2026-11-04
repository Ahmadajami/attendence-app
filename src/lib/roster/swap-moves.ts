import type { SwapRole } from '#lib/schemas/enums.js';
import {
	checkSwap,
	swapOverrides,
	type SwapDay,
	type SwapOverride,
	type SwapPlan
} from './swaps.js';

// What a swap does to each person's day (swaps plan §2), for the New swap preview, the list and
// the detail sheet. Pure: the swap service loads the roster days.

/** One person's day a swap changes: the shift before and after (`null`: off). */
export type SwapMove = {
	staffId: string;
	date: string;
	before: string | null;
	after: string | null;
	role: SwapRole;
};

const roleOf = (after: string | null): SwapRole => (after === null ? 'swap_off' : 'swap_on');

/** The moves a swap would make, from the roster days as they are now; none while it can't apply. */
export function swapMoves(
	plan: SwapPlan,
	dayOf: (staffId: string, date: string) => SwapDay | undefined,
	active: ReadonlySet<string>
): SwapMove[] {
	if (checkSwap(plan, dayOf, active).length > 0) return [];
	return swapOverrides(plan, dayOf).map((o) => ({
		staffId: o.staffId,
		date: o.shiftDate,
		before: dayOf(o.staffId, o.shiftDate)?.shiftId ?? null,
		after: o.shiftId,
		role: roleOf(o.shiftId)
	}));
}

/**
 * The moves of an applied swap, from its saved overrides: before = what the pattern plans that day
 * (`plannedOf`), after = the override.
 */
export function appliedMoves(
	overrides: readonly SwapOverride[],
	plannedOf: (staffId: string, date: string) => string | null
): SwapMove[] {
	return [...overrides]
		.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate))
		.map((o) => ({
			staffId: o.staffId,
			date: o.shiftDate,
			before: plannedOf(o.staffId, o.shiftDate),
			after: o.shiftId,
			role: roleOf(o.shiftId)
		}));
}
