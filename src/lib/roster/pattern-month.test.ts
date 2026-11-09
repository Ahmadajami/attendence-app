import { describe, expect, it } from 'vitest';
import { startOfDamascusDay } from './cycle.js';
import type { RosterData } from './input.js';
import { addMonths, isMonth, monthDates, patternMonth } from './pattern-month.js';
import type { RosterAssignment } from './roster.js';
import { D, N, slots } from './test-shifts.js';

// Made-up team `tA` in February 2030 (28 days) on a 4-day cycle: D N O O.
const MONTH = '2030-02';
const plan = (
	id: string,
	patternId: string,
	effectiveFrom: string,
	effectiveTo: string | null = null
): RosterAssignment => ({
	id,
	patternId,
	teamId: 'tA',
	departmentId: null,
	type: 'cycle',
	slots: slots('D N O O'),
	defaultWorkShiftId: null,
	anchorDate: '2030-02-01',
	effectiveFrom,
	effectiveTo
});
const member = (staffId: string, from = '2030-01-01') => ({
	staffId,
	teamId: 'tA',
	validFrom: startOfDamascusDay(from),
	validTo: null
});
const data = (over: Partial<RosterData>): RosterData => ({
	shifts: [D, N],
	memberships: [member('a'), member('b')],
	personalAssignments: [],
	teamAssignments: [plan('x1', 'P', '2030-01-01')],
	departmentAssignments: [],
	departmentChains: {},
	schedules: [
		{
			staffId: 'b',
			crewStart: 2,
			offWeekdays: null,
			effectiveFrom: '2030-01-01',
			effectiveTo: null
		}
	],
	overrides: [],
	absences: [],
	...over
});
const target = (effectiveFrom: string, effectiveTo: string | null = null) => ({
	kind: 'team',
	id: 'tA',
	effectiveFrom,
	effectiveTo
});

describe('month helpers', () => {
	it('checks, moves and lists months', () => {
		expect(isMonth('2030-02')).toBe(true);
		expect(isMonth('2030-13')).toBe(false);
		expect(isMonth('2030-2')).toBe(false);
		expect(addMonths('2030-01', 1)).toBe('2030-02');
		expect(addMonths('2030-01', -1)).toBe('2029-12');
		expect(monthDates(MONTH)).toHaveLength(28);
	});
});

describe('patternMonth (RO13)', () => {
	it('covers a team assigned all month', () => {
		const result = patternMonth('P', MONTH, [target('2030-01-01')], data({}), ['a', 'b']);
		expect(result.targets).toEqual([
			{ ...target('2030-01-01'), from: '2030-02-01', to: '2030-02-28' }
		]);
		expect(result.followers.map((f) => [f.staffId, f.plannedDays, f.crewStarts])).toEqual([
			['a', 28, [0]],
			['b', 28, [2]]
		]);
		// Crews 0 and 2 on D N O O: each day one works and one is off; D, N alternate in pairs.
		expect(result.counts.slice(0, 4).map((c) => [c.shifts, c.off])).toEqual([
			[{ D: 1 }, 1],
			[{ N: 1 }, 1],
			[{ D: 1 }, 1],
			[{ N: 1 }, 1]
		]);
	});

	it('starts on the 15th when the pattern does', () => {
		const result = patternMonth(
			'P',
			MONTH,
			[target('2030-02-15')],
			data({
				teamAssignments: [
					plan('x0', 'OLD', '2030-01-01', '2030-02-15'),
					plan('x1', 'P', '2030-02-15')
				]
			}),
			['a', 'b']
		);
		expect(result.targets[0]).toMatchObject({ from: '2030-02-15', to: '2030-02-28' });
		expect(result.followers[0]).toMatchObject({
			plannedDays: 14,
			firstDate: '2030-02-15',
			lastDate: '2030-02-28'
		});
		expect(result.followers[0].days).toHaveLength(28);
		expect(result.counts[0]).toEqual({ date: '2030-02-01', shifts: {}, off: 0, absent: 0 });
	});

	it('counts a person who joins the team mid-month from the join date', () => {
		const result = patternMonth(
			'P',
			MONTH,
			[target('2030-01-01')],
			data({ memberships: [member('a'), member('b', '2030-02-10')] }),
			['a', 'b']
		);
		expect(result.followers.find((f) => f.staffId === 'b')).toMatchObject({
			plannedDays: 19,
			firstDate: '2030-02-10'
		});
	});

	it('counts the shift a swap really gives', () => {
		// Feb 1: a planned D, b planned O (crew 2). Swap: a off, b works D.
		const result = patternMonth(
			'P',
			MONTH,
			[target('2030-01-01')],
			data({
				overrides: [
					{ staffId: 'a', shiftDate: '2030-02-01', shiftId: null, swapGroupId: 's1' },
					{ staffId: 'b', shiftDate: '2030-02-01', shiftId: 'D', swapGroupId: 's1' },
					{ staffId: 'a', shiftDate: '2030-02-05', shiftId: 'N', swapGroupId: null }
				]
			}),
			['a', 'b']
		);
		expect(result.counts[0]).toEqual({ date: '2030-02-01', shifts: { D: 1 }, off: 1, absent: 0 });
		const a = result.followers.find((f) => f.staffId === 'a')!;
		expect(a.swapDates).toEqual(['2030-02-01']);
		expect(a.editedDates).toEqual(['2030-02-05']);
	});

	it('finds nobody when the pattern planned no day of the month', () => {
		const result = patternMonth(
			'P',
			'2030-03',
			[target('2030-01-01', '2030-03-01')],
			data({ teamAssignments: [plan('x1', 'P', '2030-01-01', '2030-03-01')] }),
			['a', 'b']
		);
		expect(result.targets).toEqual([]);
		expect(result.followers).toEqual([]);
		expect(result.counts.every((c) => c.off === 0 && Object.keys(c.shifts).length === 0)).toBe(
			true
		);
	});
});
