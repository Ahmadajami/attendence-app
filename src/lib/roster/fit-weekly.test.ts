import { describe, expect, it } from 'vitest';
import {
	fitTeams,
	joinableAssignment,
	readPerson,
	replayFit,
	type FitInput,
	type GridCell
} from './fit-weekly.js';
import type { RosterData } from './input.js';
import { D, E, N } from './test-shifts.js';

// October 2026: the 1st is a Thursday. Made-up people and teams.
const DATES = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const TEAM = 'team-a';

/** A person's cells: `shift` on work weekdays, off on `offs` (0 = Sunday), then `patch` by day. */
function cells(
	shift: string,
	offs: number[],
	patch: Record<number, GridCell> = {},
	firstDay = 1
): GridCell[] {
	return DATES.map((date, i) => {
		const day = i + 1;
		if (day in patch) return patch[day];
		if (day < firstDay) return undefined;
		return offs.includes(weekday(date)) ? null : shift;
	});
}

function input(people: [string, GridCell[]][], teamId = TEAM): FitInput {
	return { dates: DATES, people: people.map(([staffId, c]) => ({ staffId, teamId, cells: c })) };
}

/** Everyone a member of their team for the whole month; nothing else stored. */
function base(fit: FitInput): RosterData {
	return {
		shifts: [D, N, E],
		memberships: fit.people.map((p) => ({
			staffId: p.staffId,
			teamId: p.teamId,
			validFrom: new Date('2026-09-30T21:00:00Z'),
			validTo: null
		})),
		personalAssignments: [],
		teamAssignments: [],
		departmentAssignments: [],
		departmentChains: {},
		schedules: [],
		overrides: [],
		absences: []
	};
}

const FRI_SAT = [5, 6];

describe('readPerson', () => {
	it('reads the main shift and the weekdays off on most of their planned days', () => {
		const read = readPerson(DATES, cells('D', FRI_SAT, { 9: 'N', 16: 'N', 6: null }));
		expect(read).toEqual({ mainShiftId: 'D', offWeekdays: [5, 6], planned: true });
	});

	it('needs a weekday off at least twice to call it a rule (R5)', () => {
		// Planned from the 24th: Friday the 30th is the only Friday off seen.
		const read = readPerson(DATES, cells('D', [5], {}, 24));
		expect(read.offWeekdays).toEqual([]);
	});
});

describe('fitTeams', () => {
	it('R1: one shift, the same off days → one pattern, nothing else', () => {
		const [fit] = fitTeams(
			input([
				['p1', cells('D', FRI_SAT)],
				['p2', cells('D', FRI_SAT)],
				['p3', cells('D', FRI_SAT)]
			])
		);
		expect(fit.mainShiftId).toBe('D');
		expect(fit.slots).toEqual(['D', 'D', 'D', 'D', 'D', null, null]);
		expect([fit.ownRules, fit.personal, fit.changes]).toEqual([[], [], []]);
	});

	it('R2 and R3: own off days; another shift shares one personal pattern', () => {
		const [fit] = fitTeams(
			input([
				['p1', cells('D', FRI_SAT)],
				['p2', cells('D', FRI_SAT)],
				['p3', cells('D', [0, 1])],
				['p4', cells('E', [3])],
				['p5', cells('E', [3])]
			])
		);
		expect(fit.ownRules).toEqual([{ staffId: 'p3', offWeekdays: [0, 1] }]);
		expect(fit.personal).toEqual([
			{
				shiftId: 'E',
				offWeekdays: [3],
				slots: ['E', 'E', 'E', null, 'E', 'E', 'E'],
				staffIds: ['p4', 'p5']
			}
		]);
		expect(fit.changes).toEqual([]);
	});

	it('R4: a usual work day off and a usual off day worked are day changes', () => {
		// The 5th is a Monday (work), the 9th a Friday (off), worked on another shift: no swap.
		const [fit] = fitTeams(
			input([
				['p1', cells('D', FRI_SAT, { 5: null, 9: 'N' })],
				['p2', cells('D', FRI_SAT)]
			])
		);
		expect(fit.swaps).toEqual([]);
		expect(fit.changes).toEqual([
			{ staffId: 'p1', date: '2026-10-05', shiftId: null },
			{ staffId: 'p1', date: '2026-10-09', shiftId: 'N' }
		]);
	});

	it('OC4: a day off moved inside the week (or month) is a self swap', () => {
		// Week of the 4th: Monday the 5th off, Friday the 9th worked on D → self swap, week.
		// Tuesday the 13th off, Saturday the 24th worked on D (another week) → self swap, month.
		// Wednesday the 28th off with no worked off day left → a day edit.
		const [fit] = fitTeams(
			input([
				['p1', cells('D', FRI_SAT, { 5: null, 9: 'D', 13: null, 24: 'D', 28: null })],
				['p2', cells('D', FRI_SAT)]
			])
		);
		expect(fit.swaps).toEqual([
			{
				staffId: 'p1',
				firstDate: '2026-10-05',
				secondDate: '2026-10-09',
				shiftId: 'D',
				scope: 'week'
			},
			{
				staffId: 'p1',
				firstDate: '2026-10-13',
				secondDate: '2026-10-24',
				shiftId: 'D',
				scope: 'month'
			}
		]);
		expect(fit.changes).toEqual([{ staffId: 'p1', date: '2026-10-28', shiftId: null }]);
	});

	it('R5: empty cells are no plan; a person with none at all is listed', () => {
		const [fit] = fitTeams(
			input([
				['p1', cells('D', FRI_SAT)],
				['p2', cells('D', FRI_SAT, {}, 10)],
				['p3', DATES.map(() => undefined)]
			])
		);
		expect(fit.changes).toEqual([]);
		expect(fit.unplanned).toEqual(['p3']);
	});
});

describe('replayFit', () => {
	it('R6: the fitted rows give the grid on every planned day', () => {
		const grid = input([
			['p1', cells('D', FRI_SAT, { 5: null, 9: 'N', 13: null, 16: 'D' })],
			['p2', cells('D', FRI_SAT, {}, 10)],
			['p3', cells('D', [0, 1])],
			['p4', cells('E', [3], { 14: 'E' })],
			['p5', cells('E', [3])],
			['p6', cells('N', [])]
		]);
		const fits = fitTeams(grid);
		expect(replayFit(grid, fits, base(grid))).toEqual([]);
	});

	it('RI10: a department group reaches people of its sub-departments, with no team', () => {
		const grid: FitInput = {
			dates: DATES,
			people: [
				{ staffId: 'p1', teamId: 'dept-parent', cells: cells('D', FRI_SAT) },
				{ staffId: 'p2', teamId: 'dept-parent', cells: cells('D', [0, 1]) }
			]
		};
		const stored: RosterData = {
			...base(grid),
			memberships: [],
			departmentChains: { p1: ['dept-child', 'dept-parent'], p2: ['dept-parent'] }
		};
		const fits = fitTeams(grid);
		const asDepartment = (id: string) => ({ teamId: null, departmentId: id });
		expect(replayFit(grid, fits, stored, undefined, asDepartment)).toEqual([]);
		// Assigned to a team instead, nobody is reached (no memberships): every day differs.
		expect(replayFit(grid, fits, stored).length).toBeGreaterThan(0);
	});

	it('RI10: a person-by-person group makes personal patterns, no group pattern or own rule', () => {
		const grid: FitInput = {
			dates: DATES,
			people: [
				{ staffId: 'p1', teamId: 'team-x', cells: cells('D', FRI_SAT) },
				{ staffId: 'p2', teamId: 'team-x', cells: cells('D', FRI_SAT, { 5: null, 9: 'D' }) },
				{ staffId: 'p3', teamId: 'team-x', cells: cells('D', [0, 1]) }
			],
			personalGroups: new Set(['team-x'])
		};
		const [fit] = fitTeams(grid);
		expect([fit.mainShiftId, fit.ownRules]).toEqual([null, []]);
		expect(fit.personal.map((p) => [p.offWeekdays, p.staffIds])).toEqual([
			[
				[5, 6],
				['p1', 'p2']
			],
			[[0, 1], ['p3']]
		]);
		expect(fit.swaps).toHaveLength(1);
		// No membership needed: personal assignments reach the person directly.
		expect(replayFit(grid, [fit], { ...base(grid), memberships: [] })).toEqual([]);
	});

	it('RI11: people joining a department pattern already saved get only their own rows', () => {
		// The department already has D, Friday and Saturday off, for the month (an earlier batch).
		const grid: FitInput = {
			dates: DATES,
			people: [
				{ staffId: 'p1', teamId: 'dept-a', cells: cells('D', FRI_SAT) },
				{ staffId: 'p2', teamId: 'dept-a', cells: cells('D', [0, 1], { 7: 'N' }) },
				{ staffId: 'p3', teamId: 'dept-a', cells: cells('E', [3]) },
				{ staffId: 'p4', teamId: 'dept-a', cells: cells('E', [3]) }
			],
			joined: new Map([['dept-a', { mainShiftId: 'D', offWeekdays: FRI_SAT }]])
		};
		const [fit] = fitTeams(grid);
		// E is the most common shift of the file, but the saved pattern's D stays the group's.
		expect([fit.joined, fit.mainShiftId, fit.offWeekdays]).toEqual([true, 'D', FRI_SAT]);
		expect(fit.ownRules).toEqual([{ staffId: 'p2', offWeekdays: [0, 1] }]);
		expect(fit.personal.map((p) => [p.shiftId, p.staffIds])).toEqual([['E', ['p3', 'p4']]]);
		expect(fit.changes).toEqual([{ staffId: 'p2', date: '2026-10-07', shiftId: 'N' }]);
		const saved: RosterData = {
			...base(grid),
			memberships: [],
			departmentChains: { p1: ['dept-a'], p2: ['dept-a'], p3: ['dept-a'], p4: ['dept-a'] },
			departmentAssignments: [
				{
					id: 'saved',
					patternId: 'saved-pattern',
					teamId: null,
					departmentId: 'dept-a',
					type: 'weekly',
					slots: ['D', 'D', 'D', 'D', 'D', null, null],
					defaultWorkShiftId: 'D',
					anchorDate: null,
					effectiveFrom: '2026-10-01',
					effectiveTo: '2026-11-01'
				}
			]
		};
		const asDepartment = (id: string) => ({ teamId: null, departmentId: id });
		expect(replayFit(grid, [fit], saved, undefined, asDepartment)).toEqual([]);
		// Without the saved pattern nothing plans p1: the replay adds no group pattern of its own.
		expect(
			replayFit(grid, [fit], { ...saved, departmentAssignments: [] }, undefined, asDepartment)
		).not.toEqual([]);
	});

	it('reports a day the stored roster plans differently (here: no membership on the 1st)', () => {
		const grid = input([['p1', cells('D', FRI_SAT)]]);
		const stored = base(grid);
		const late: RosterData = {
			...stored,
			memberships: [{ ...stored.memberships[0], validFrom: new Date('2026-10-01T21:00:00Z') }]
		};
		expect(replayFit(grid, fitTeams(grid), late)).toEqual([
			{ staffId: 'p1', date: '2026-10-01', want: 'D', got: null }
		]);
	});
});

describe('joinableAssignment (RI11)', () => {
	const WEEK = ['D', 'D', 'D', 'D', 'D', null, null];
	const saved = (over: Partial<Parameters<typeof joinableAssignment>[0][number]> = {}) => ({
		patternId: 'pat',
		type: 'weekly' as const,
		slots: WEEK,
		effectiveFrom: '2026-10-01',
		effectiveTo: '2026-11-01' as string | null,
		...over
	});

	it('gives the shift and off weekdays of one weekly pattern covering the month', () => {
		expect(joinableAssignment([saved()], '2026-10-01', '2026-11-01')).toEqual({
			patternId: 'pat',
			mainShiftId: 'D',
			offWeekdays: [5, 6]
		});
		expect(
			joinableAssignment([saved({ effectiveTo: null })], '2026-10-01', '2026-11-01')
		).not.toBeNull();
	});

	it('refuses a cycle, two shifts, two assignments, or one that changes inside the month', () => {
		const month = ['2026-10-01', '2026-11-01'] as const;
		expect(joinableAssignment([saved({ type: 'cycle' })], ...month)).toBeNull();
		expect(
			joinableAssignment([saved({ slots: ['D', 'E', 'D', 'D', 'D', null, null] })], ...month)
		).toBeNull();
		expect(joinableAssignment([saved(), saved({ patternId: 'other' })], ...month)).toBeNull();
		expect(joinableAssignment([saved({ effectiveFrom: '2026-10-10' })], ...month)).toBeNull();
		expect(joinableAssignment([saved({ effectiveTo: '2026-10-20' })], ...month)).toBeNull();
		// One that ended before the month doesn't count.
		expect(
			joinableAssignment(
				[saved({ effectiveFrom: '2026-09-01', effectiveTo: '2026-10-01' })],
				...month
			)
		).toBeNull();
	});
});
