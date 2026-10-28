import { describe, expect, it } from 'vitest';
import type { ShiftKind } from '#lib/schemas/enums.js';
import { startOfDamascusDay } from './cycle.js';
import {
	rosterDay,
	rosterRange,
	teamOnDate,
	type RosterInput,
	type RosterPattern
} from './roster.js';

const kinds = (s: string): ShiftKind[] =>
	s.split(' ').map((k) => (k === 'D' ? 'day' : k === 'N' ? 'night' : 'off'));

const pattern = (
	teamId: string | null,
	cycle: string,
	anchorDate: string,
	effectiveFrom: string,
	effectiveTo: string | null = null
): RosterPattern => ({
	teamId,
	cycle: kinds(cycle),
	anchorDate,
	dayStart: '07:00:00',
	nightStart: '19:00:00',
	effectiveFrom,
	effectiveTo
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
		pattern('team-a', 'D N O O', '2026-11-02', '2026-10-01', '2026-11-06'),
		pattern('team-a', 'D D N N O O O O', '2026-11-06', '2026-11-06'),
		pattern('team-b', 'N O', '2026-11-01', '2026-01-01')
	],
	overrides: [],
	absences: [],
	fallbackTimes: { dayStart: '07:00', nightStart: '19:00' }
};

const kindsOf = (input: RosterInput, from: string, days: number) =>
	rosterRange(input, from, days)
		.map((d) => d.kind[0].toUpperCase())
		.join(' ');

describe('team cycle', () => {
	it('follows the team version in force', () => {
		const day = rosterDay(base, '2026-11-03');
		expect(day).toMatchObject({ teamId: 'team-a', kind: 'night', source: 'team' });
		expect(day.start?.toISOString()).toBe('2026-11-03T16:00:00.000Z');
		expect(day.end?.toISOString()).toBe('2026-11-04T04:00:00.000Z');
	});

	it('switches version mid-cycle on its effective date', () => {
		// v1 (D N O O from 2 Nov) to 5 Nov, then v2 (8-day from 6 Nov).
		expect(kindsOf(base, '2026-11-02', 8)).toBe('D N O O D D N N');
	});

	it('switches team on the move date, mid-cycle', () => {
		const nightBefore = rosterDay(base, '2026-11-09');
		expect(nightBefore).toMatchObject({ teamId: 'team-a', kind: 'night' });
		// The night that starts on 9 Nov ends on the move date but stays with team A.
		expect(nightBefore.end?.toISOString()).toBe('2026-11-10T04:00:00.000Z');
		expect(rosterDay(base, '2026-11-10')).toMatchObject({ teamId: 'team-b', kind: 'off' });
		expect(rosterDay(base, '2026-11-11')).toMatchObject({ teamId: 'team-b', kind: 'night' });
	});

	it('is off with no team or no cycle', () => {
		const loner: RosterInput = { ...base, memberships: [] };
		expect(rosterDay(loner, '2026-11-03')).toMatchObject({
			teamId: null,
			kind: 'off',
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
});

describe('personal cycle', () => {
	const input: RosterInput = {
		...base,
		personalPatterns: [pattern(null, 'D D D D D O O', '2026-11-02', '2026-11-02')]
	};

	it('wins over the team cycle on its dates', () => {
		expect(rosterDay(input, '2026-11-04')).toMatchObject({
			teamId: 'team-a',
			kind: 'day',
			source: 'personal'
		});
		expect(kindsOf(input, '2026-11-02', 7)).toBe('D D D D D O O');
	});

	it('leaves dates before it to the team', () => {
		expect(rosterDay(input, '2026-11-01')).toMatchObject({ source: 'team' });
	});
});

describe('overrides and absences', () => {
	it('makes an extra shift from a Day on a planned off day', () => {
		const input = {
			...base,
			overrides: [{ shiftDate: '2026-11-04', kind: 'day' as const, swapGroupId: null }]
		};
		expect(rosterDay(input, '2026-11-04')).toMatchObject({
			kind: 'day',
			plannedKind: 'off',
			source: 'override',
			extra: true
		});
	});

	it('does not count a swapped shift as extra', () => {
		const input = {
			...base,
			overrides: [{ shiftDate: '2026-11-04', kind: 'day' as const, swapGroupId: 'swap-1' }]
		};
		expect(rosterDay(input, '2026-11-04')).toMatchObject({
			kind: 'day',
			extra: false,
			swapGroupId: 'swap-1'
		});
	});

	it('gives a day off over a rostered shift', () => {
		const input = {
			...base,
			overrides: [{ shiftDate: '2026-11-03', kind: 'off' as const, swapGroupId: null }]
		};
		expect(rosterDay(input, '2026-11-03')).toMatchObject({
			kind: 'off',
			plannedKind: 'night',
			start: null
		});
	});

	it('puts an absence above an override', () => {
		const input: RosterInput = {
			...base,
			overrides: [{ shiftDate: '2026-11-03', kind: 'day', swapGroupId: null }],
			absences: [{ startsOn: '2026-11-02', endsOn: '2026-11-03', type: 'sick' }]
		};
		expect(rosterDay(input, '2026-11-03')).toMatchObject({
			kind: 'off',
			source: 'absence',
			absenceType: 'sick',
			extra: false
		});
		expect(rosterDay(input, '2026-11-04')).toMatchObject({ source: 'team', absenceType: null });
	});

	it('uses the airport times for an override no cycle covers', () => {
		const input: RosterInput = {
			...base,
			memberships: [],
			overrides: [{ shiftDate: '2026-11-03', kind: 'night', swapGroupId: null }]
		};
		const day = rosterDay(input, '2026-11-03');
		expect(day).toMatchObject({ kind: 'night', extra: true, source: 'override' });
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
