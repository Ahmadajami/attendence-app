import { describe, expect, it } from 'vitest';
import { startOfDamascusDay } from './cycle.js';
import { rosterDay, type RosterAssignment, type RosterInput } from './roster.js';
import { checkSwap, sameScope, swapOverrides, weekStart, type SwapPlan } from './swaps.js';
import { SHIFTS, slots } from './test-shifts.js';

// Two made-up people, weekly patterns, Sunday first; 1 Nov 2026 is a Sunday.
// A (team-a): off Sun, D Mon–Fri, off Sat.   B (team-b): D Sun, D Mon, off Tue–Wed, D Thu–Sat.

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
	teamAssignments: [weekly('team-a', 'O D D D D D O'), weekly('team-b', 'D D O O D D D')],
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

const selfSwap = (first: string, second: string, scope: 'week' | 'month' = 'week'): SwapPlan => ({
	kind: 'self_swap',
	staffId: 'A',
	otherStaffId: null,
	firstDate: first,
	secondDate: second,
	scope
});

const empSwap = (first: string, second: string | null = null): SwapPlan => ({
	kind: 'emp_swap',
	staffId: 'A',
	otherStaffId: 'B',
	firstDate: first,
	secondDate: second,
	scope: 'week'
});

describe('scope (Sun–Sat week, calendar month)', () => {
	it('starts the week on Sunday', () => {
		expect(weekStart('2026-11-01')).toBe('2026-11-01');
		expect(weekStart('2026-11-07')).toBe('2026-11-01');
		expect(weekStart('2026-11-08')).toBe('2026-11-08');
	});

	it('compares weeks and months', () => {
		expect(sameScope('2026-11-03', '2026-11-07', 'week')).toBe(true);
		expect(sameScope('2026-11-07', '2026-11-08', 'week')).toBe(false);
		expect(sameScope('2026-11-03', '2026-11-30', 'month')).toBe(true);
		expect(sameScope('2026-10-31', '2026-11-01', 'month')).toBe(false);
	});
});

describe('self swap', () => {
	it('T17: Tue (work) ↔ Sat (off) in the same week → Tue off, Sat works Tue’s shift', () => {
		const plan = selfSwap('2026-11-03', '2026-11-07');
		expect(checkSwap(plan, dayOf, ACTIVE)).toEqual([]);
		const rows = swapOverrides(plan, dayOf);
		expect(rows).toEqual([
			{ staffId: 'A', shiftDate: '2026-11-03', shiftId: null },
			{ staffId: 'A', shiftDate: '2026-11-07', shiftId: 'D' }
		]);

		// Applied as overrides of swap sw1, the roster shows the moved days.
		const applied: RosterInput = {
			...people.A,
			overrides: rows.map((r) => ({
				shiftDate: r.shiftDate,
				shiftId: r.shiftId,
				swapGroupId: 'sw1'
			}))
		};
		expect(rosterDay(applied, '2026-11-03')).toMatchObject({ shiftId: null, swapRole: 'swap_off' });
		expect(rosterDay(applied, '2026-11-07')).toMatchObject({ shiftId: 'D', swapRole: 'swap_on' });
	});

	it('T18: across two weeks → refused with scope "week", accepted with scope "month"', () => {
		expect(checkSwap(selfSwap('2026-11-03', '2026-11-08'), dayOf, ACTIVE)).toEqual(['scope']);
		expect(checkSwap(selfSwap('2026-11-03', '2026-11-08', 'month'), dayOf, ACTIVE)).toEqual([]);
	});

	it('refuses a W that is off and an O that is worked', () => {
		expect(checkSwap(selfSwap('2026-11-07', '2026-11-03'), dayOf, ACTIVE)).toEqual([
			'a_not_working',
			'o_not_off'
		]);
	});
});

describe('employee swap', () => {
	it('T19: A works and B is off on Tue → A off, B works A’s shift; Sat reverses it', () => {
		expect(checkSwap(empSwap('2026-11-03'), dayOf, ACTIVE)).toEqual([]);
		expect(swapOverrides(empSwap('2026-11-03'), dayOf)).toEqual([
			{ staffId: 'A', shiftDate: '2026-11-03', shiftId: null },
			{ staffId: 'B', shiftDate: '2026-11-03', shiftId: 'D' }
		]);

		const back = empSwap('2026-11-03', '2026-11-07');
		expect(checkSwap(back, dayOf, ACTIVE)).toEqual([]);
		expect(swapOverrides(back, dayOf)).toEqual([
			{ staffId: 'A', shiftDate: '2026-11-03', shiftId: null },
			{ staffId: 'B', shiftDate: '2026-11-03', shiftId: 'D' },
			{ staffId: 'B', shiftDate: '2026-11-07', shiftId: null },
			{ staffId: 'A', shiftDate: '2026-11-07', shiftId: 'D' }
		]);
	});

	it('T20: B also works on the date → refused "b_not_off"', () => {
		expect(checkSwap(empSwap('2026-11-02'), dayOf, ACTIVE)).toEqual(['b_not_off']);
	});

	it('refuses a return date where B is off or A works', () => {
		expect(checkSwap(empSwap('2026-11-03', '2026-11-04'), dayOf, ACTIVE)).toEqual([
			'b_not_working',
			'a_not_off'
		]);
	});
});

describe('conflicts', () => {
	it('refuses an absence, another one-off shift, a holiday and inactive people', () => {
		const busy: Record<string, RosterInput> = {
			A: {
				...people.A,
				absences: [{ startsOn: '2026-11-03', endsOn: '2026-11-03', type: 'sick' }]
			},
			B: { ...people.B, overrides: [{ shiftDate: '2026-11-03', shiftId: 'N', swapGroupId: null }] }
		};
		const busyDay = (id: string, date: string) => rosterDay(busy[id], date);
		const issues = checkSwap(empSwap('2026-11-03'), busyDay, new Set(['A']));
		expect(issues).toEqual(expect.arrayContaining(['inactive', 'absence', 'override']));

		const holidays: RosterInput = {
			...people.A,
			holidays: [
				{
					id: 'h1',
					patternId: 'p-team-a',
					startsOn: '2026-11-07',
					endsOn: '2026-11-07',
					otEligible: true
				}
			]
		};
		expect(
			checkSwap(selfSwap('2026-11-03', '2026-11-07'), (_, d) => rosterDay(holidays, d), ACTIVE)
		).toEqual(['holiday']);
	});

	it("lets the swap's own overrides through when it is re-checked", () => {
		const applied: RosterInput = {
			...people.A,
			overrides: [
				{ shiftDate: '2026-11-03', shiftId: null, swapGroupId: 'sw1' },
				{ shiftDate: '2026-11-07', shiftId: 'D', swapGroupId: 'sw1' }
			]
		};
		const appliedDay = (_: string, d: string) => rosterDay(applied, d);
		const plan = selfSwap('2026-11-03', '2026-11-07');
		expect(checkSwap(plan, appliedDay, ACTIVE, 'sw2')).toContain('override');
		expect(checkSwap(plan, appliedDay, ACTIVE, 'sw1')).not.toContain('override');
	});
});
