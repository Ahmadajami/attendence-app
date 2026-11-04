import { describe, expect, it } from 'vitest';
import { startOfDamascusDay } from './cycle.js';
import { rosterDay, type RosterAssignment, type RosterInput } from './roster.js';
import { appliedMoves, swapMoves } from './swap-moves.js';
import type { SwapPlan } from './swaps.js';
import { SHIFTS, slots } from './test-shifts.js';

// Two made-up people, weekly patterns, Sunday first; 1 Nov 2026 is a Sunday.
// A (team-a): off Sun, D Mon–Fri, off Sat.   B (team-b): N Sun, N Mon, off Tue–Wed, N Thu–Sat.

const weekly = (teamId: string, codes: string): RosterAssignment => ({
	id: `a-${teamId}`,
	patternId: `p-${teamId}`,
	teamId,
	departmentId: null,
	type: 'weekly',
	slots: slots(codes),
	defaultWorkShiftId: null,
	anchorDate: null,
	effectiveFrom: '2026-01-01',
	effectiveTo: null
});

const person = (teamId: string): RosterInput => ({
	memberships: [{ teamId, validFrom: startOfDamascusDay('2026-01-01'), validTo: null }],
	personalAssignments: [],
	teamAssignments: [weekly('team-a', 'O D D D D D O'), weekly('team-b', 'N N O O N N N')],
	departmentAssignments: [],
	departmentChain: [],
	schedules: [],
	overrides: [],
	absences: [],
	holidays: [],
	shifts: SHIFTS
});

const people: Record<string, RosterInput> = { A: person('team-a'), B: person('team-b') };
const dayOf = (staffId: string, date: string) => {
	const input = people[staffId];
	return input ? rosterDay(input, date) : undefined;
};
const ACTIVE = new Set(['A', 'B']);

const plan = (over: Partial<SwapPlan>): SwapPlan => ({
	kind: 'self_swap',
	staffId: 'A',
	otherStaffId: null,
	firstDate: '2026-11-03',
	secondDate: '2026-11-07',
	scope: 'week',
	...over
});

describe('swapMoves', () => {
	it('self swap: the work day becomes off, the off day works its shift', () => {
		expect(swapMoves(plan({}), dayOf, ACTIVE)).toEqual([
			{ staffId: 'A', date: '2026-11-03', before: 'D', after: null, role: 'swap_off' },
			{ staffId: 'A', date: '2026-11-07', before: null, after: 'D', role: 'swap_on' }
		]);
	});

	it('employee swap without a return date: B works A’s shift on D', () => {
		const moves = swapMoves(
			plan({ kind: 'emp_swap', otherStaffId: 'B', secondDate: null }),
			dayOf,
			ACTIVE
		);
		expect(moves).toEqual([
			{ staffId: 'A', date: '2026-11-03', before: 'D', after: null, role: 'swap_off' },
			{ staffId: 'B', date: '2026-11-03', before: null, after: 'D', role: 'swap_on' }
		]);
	});

	it('employee swap with a return date: A works B’s shift on D2', () => {
		const moves = swapMoves(
			plan({ kind: 'emp_swap', otherStaffId: 'B', secondDate: '2026-11-07' }),
			dayOf,
			ACTIVE
		);
		expect(moves.slice(2)).toEqual([
			{ staffId: 'B', date: '2026-11-07', before: 'N', after: null, role: 'swap_off' },
			{ staffId: 'A', date: '2026-11-07', before: null, after: 'N', role: 'swap_on' }
		]);
	});

	it('no moves while the swap cannot apply', () => {
		// W is a Sunday: A is off.
		expect(swapMoves(plan({ firstDate: '2026-11-01' }), dayOf, ACTIVE)).toEqual([]);
		// A inactive.
		expect(swapMoves(plan({}), dayOf, new Set(['B']))).toEqual([]);
	});
});

describe('appliedMoves', () => {
	it('lists the saved overrides by date with the planned shift before', () => {
		const planned = (staffId: string, date: string) => dayOf(staffId, date)?.plannedShiftId ?? null;
		expect(
			appliedMoves(
				[
					{ staffId: 'A', shiftDate: '2026-11-07', shiftId: 'D' },
					{ staffId: 'A', shiftDate: '2026-11-03', shiftId: null }
				],
				planned
			)
		).toEqual([
			{ staffId: 'A', date: '2026-11-03', before: 'D', after: null, role: 'swap_off' },
			{ staffId: 'A', date: '2026-11-07', before: null, after: 'D', role: 'swap_on' }
		]);
	});
});
