import { describe, expect, it } from 'vitest';
import { startOfDamascusDay } from './cycle.js';
import {
	rosterDay,
	rosterRange,
	teamOnDate,
	type RosterInput,
	type RosterPattern
} from './roster.js';
import { letter, SHIFTS, slots } from './test-shifts.js';

type Owner = { teamId?: string; departmentId?: string };

const pattern = (
	owner: Owner,
	codes: string,
	anchorDate: string,
	effectiveFrom: string,
	effectiveTo: string | null = null
): RosterPattern => ({
	teamId: owner.teamId ?? null,
	departmentId: owner.departmentId ?? null,
	type: 'cycle',
	slots: slots(codes),
	anchorDate,
	effectiveFrom,
	effectiveTo
});

const weekly = (owner: Owner, codes: string, effectiveFrom: string): RosterPattern => ({
	...pattern(owner, codes, '2026-01-01', effectiveFrom),
	type: 'weekly',
	anchorDate: null
});

// Team A until 10 Nov, team B from then. Team A changes cycle on 6 Nov.
const base: RosterInput = {
	memberships: [
		{
			teamId: 'team-a',
			validFrom: startOfDamascusDay('2026-01-01'),
			validTo: startOfDamascusDay('2026-11-10')
		},
		{ teamId: 'team-b', validFrom: startOfDamascusDay('2026-11-10'), validTo: null }
	],
	personalPatterns: [],
	teamPatterns: [
		pattern({ teamId: 'team-a' }, 'D N O O', '2026-11-02', '2026-10-01', '2026-11-06'),
		pattern({ teamId: 'team-a' }, 'D D N N O O O O', '2026-11-06', '2026-11-06'),
		pattern({ teamId: 'team-b' }, 'N O', '2026-11-01', '2026-01-01')
	],
	departmentPatterns: [],
	departmentChain: [],
	overrides: [],
	absences: [],
	shifts: SHIFTS
};

const lettersOf = (input: RosterInput, from: string, days: number) =>
	rosterRange(input, from, days)
		.map((d) => letter(d.shiftId))
		.join(' ');

describe('team pattern', () => {
	it('follows the team version in force', () => {
		const day = rosterDay(base, '2026-11-03');
		expect(day).toMatchObject({ teamId: 'team-a', shiftId: 'N', source: 'team' });
		expect(day.shift?.code).toBe('N');
		expect(day.start?.toISOString()).toBe('2026-11-03T16:00:00.000Z');
		expect(day.end?.toISOString()).toBe('2026-11-04T04:00:00.000Z');
	});

	it('switches version mid-cycle on its effective date', () => {
		// v1 (D N O O from 2 Nov) to 5 Nov, then v2 (8-day from 6 Nov).
		expect(lettersOf(base, '2026-11-02', 8)).toBe('D N O O D D N N');
	});

	it('switches team on the move date, mid-cycle', () => {
		const nightBefore = rosterDay(base, '2026-11-09');
		expect(nightBefore).toMatchObject({ teamId: 'team-a', shiftId: 'N' });
		// The night that starts on 9 Nov ends on the move date but stays with team A.
		expect(nightBefore.end?.toISOString()).toBe('2026-11-10T04:00:00.000Z');
		expect(rosterDay(base, '2026-11-10')).toMatchObject({ teamId: 'team-b', shiftId: null });
		expect(rosterDay(base, '2026-11-11')).toMatchObject({ teamId: 'team-b', shiftId: 'N' });
	});

	it('is off with no team or no pattern', () => {
		const loner: RosterInput = { ...base, memberships: [] };
		expect(rosterDay(loner, '2026-11-03')).toMatchObject({
			teamId: null,
			shiftId: null,
			shift: null,
			source: 'none',
			start: null
		});
	});

	it('takes the team at 00:00 Damascus of the date', () => {
		const memberships = [
			{ teamId: 'x', validFrom: new Date('2026-11-04T21:00:00Z'), validTo: null }
		];
		expect(teamOnDate(memberships, '2026-11-04')).toBeNull();
		expect(teamOnDate(memberships, '2026-11-05')).toBe('x');
	});

	it('plans a non-12 h shift with its own span', () => {
		const input: RosterInput = {
			...base,
			teamPatterns: [pattern({ teamId: 'team-a' }, 'E O', '2026-11-02', '2026-01-01')]
		};
		const day = rosterDay(input, '2026-11-02');
		expect(day.shiftId).toBe('E');
		expect(day.start?.toISOString()).toBe('2026-11-02T13:00:00.000Z');
		expect(day.end?.toISOString()).toBe('2026-11-03T01:00:00.000Z');
	});
});

describe('personal pattern', () => {
	const input: RosterInput = {
		...base,
		personalPatterns: [pattern({}, 'D D D D D O O', '2026-11-02', '2026-11-02')]
	};

	it('wins over the team pattern on its dates', () => {
		expect(rosterDay(input, '2026-11-04')).toMatchObject({
			teamId: 'team-a',
			shiftId: 'D',
			source: 'personal'
		});
		expect(lettersOf(input, '2026-11-02', 7)).toBe('D D D D D O O');
	});

	it('leaves dates before it to the team', () => {
		expect(rosterDay(input, '2026-11-01')).toMatchObject({ source: 'team' });
	});

	it('can be weekly (Sunday first)', () => {
		const office: RosterInput = {
			...base,
			personalPatterns: [weekly({}, 'D D D D D O O', '2026-11-01')]
		};
		// 2026-11-01 is a Sunday: Sun–Thu D, Fri–Sat off.
		expect(lettersOf(office, '2026-11-01', 9)).toBe('D D D D D O O D D');
	});
});

describe('department pattern', () => {
	// Department tree: child → parent → root. The person is in `child`.
	const dept: RosterInput = {
		...base,
		memberships: [],
		teamPatterns: [],
		departmentPatterns: [
			pattern({ departmentId: 'root' }, 'N O', '2026-11-02', '2026-01-01'),
			weekly({ departmentId: 'parent' }, 'O D D D D D O', '2026-01-01')
		],
		departmentChain: ['child', 'parent', 'root']
	};

	it('is used when there is no personal or team pattern', () => {
		// 2026-11-02 is a Monday.
		expect(rosterDay(dept, '2026-11-02')).toMatchObject({ shiftId: 'D', source: 'department' });
	});

	it('is inherited from a parent; the nearest department wins', () => {
		// `parent` (nearer) wins over `root`.
		expect(lettersOf(dept, '2026-11-01', 7)).toBe('O D D D D D O');
		const rootOnly: RosterInput = { ...dept, departmentChain: ['child', 'root'] };
		expect(lettersOf(rootOnly, '2026-11-02', 4)).toBe('N O N O');
	});

	it('loses to a team pattern, and covers dates the team has none for', () => {
		const withTeam: RosterInput = {
			...dept,
			memberships: base.memberships,
			teamPatterns: [pattern({ teamId: 'team-a' }, 'N N', '2026-11-02', '2026-11-03')]
		};
		expect(rosterDay(withTeam, '2026-11-03')).toMatchObject({ shiftId: 'N', source: 'team' });
		expect(rosterDay(withTeam, '2026-11-02')).toMatchObject({ shiftId: 'D', source: 'department' });
	});

	it('ignores patterns of departments outside the chain', () => {
		expect(rosterDay({ ...dept, departmentChain: ['other'] }, '2026-11-02')).toMatchObject({
			shiftId: null,
			source: 'none'
		});
	});
});

describe('overrides and absences', () => {
	it('makes an extra shift from a shift on a planned off day', () => {
		const input: RosterInput = {
			...base,
			overrides: [{ shiftDate: '2026-11-04', shiftId: 'D', swapGroupId: null }]
		};
		expect(rosterDay(input, '2026-11-04')).toMatchObject({
			shiftId: 'D',
			plannedShiftId: null,
			source: 'override',
			extra: true
		});
	});

	it('does not count a swapped shift as extra', () => {
		const input: RosterInput = {
			...base,
			overrides: [{ shiftDate: '2026-11-04', shiftId: 'D', swapGroupId: 'swap-1' }]
		};
		expect(rosterDay(input, '2026-11-04')).toMatchObject({
			shiftId: 'D',
			extra: false,
			swapGroupId: 'swap-1'
		});
	});

	it('gives a day off over a rostered shift', () => {
		const input: RosterInput = {
			...base,
			overrides: [{ shiftDate: '2026-11-03', shiftId: null, swapGroupId: null }]
		};
		expect(rosterDay(input, '2026-11-03')).toMatchObject({
			shiftId: null,
			plannedShiftId: 'N',
			start: null
		});
	});

	it('puts an absence above an override', () => {
		const input: RosterInput = {
			...base,
			overrides: [{ shiftDate: '2026-11-03', shiftId: 'D', swapGroupId: null }],
			absences: [{ startsOn: '2026-11-02', endsOn: '2026-11-03', type: 'sick' }]
		};
		expect(rosterDay(input, '2026-11-03')).toMatchObject({
			shiftId: null,
			source: 'absence',
			absenceType: 'sick',
			extra: false
		});
		expect(rosterDay(input, '2026-11-04')).toMatchObject({ source: 'team', absenceType: null });
	});

	it("uses the override shift's times on a date no pattern covers", () => {
		const input: RosterInput = {
			...base,
			memberships: [],
			overrides: [{ shiftDate: '2026-11-03', shiftId: 'N', swapGroupId: null }]
		};
		const day = rosterDay(input, '2026-11-03');
		expect(day).toMatchObject({ shiftId: 'N', extra: true, source: 'override' });
		expect(day.start?.toISOString()).toBe('2026-11-03T16:00:00.000Z');
	});
});

describe('rosterRange', () => {
	it('returns consecutive dates', () => {
		expect(rosterRange(base, '2026-10-30', 4).map((d) => d.date)).toEqual([
			'2026-10-30',
			'2026-10-31',
			'2026-11-01',
			'2026-11-02'
		]);
	});
});
