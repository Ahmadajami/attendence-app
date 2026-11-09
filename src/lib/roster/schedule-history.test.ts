import { describe, expect, it } from 'vitest';
import { startOfDamascusDay } from './cycle.js';
import type { RosterAssignment } from './roster.js';
import {
	inPeriod,
	scheduleHistory,
	type HistoryInput,
	type HistorySchedule
} from './schedule-history.js';

const slots = ['s1', 's1', null, null];
const teamPlan = (
	id: string,
	teamId: string,
	effectiveFrom: string,
	effectiveTo: string | null,
	patternId = `p-${id}`
): RosterAssignment => ({
	id,
	patternId,
	teamId,
	departmentId: null,
	type: 'cycle',
	slots,
	defaultWorkShiftId: null,
	anchorDate: '2030-01-01',
	effectiveFrom,
	effectiveTo
});
const crew = (
	crewStart: number,
	effectiveFrom: string,
	effectiveTo: string | null,
	reason = 'Made-up reason'
): HistorySchedule => ({ crewStart, offWeekdays: null, effectiveFrom, effectiveTo, reason });

const base = (over: Partial<HistoryInput>): HistoryInput => ({
	memberships: [{ teamId: 'tA', validFrom: startOfDamascusDay('2030-01-01'), validTo: null }],
	personalAssignments: [],
	teamAssignments: [],
	departmentAssignments: [],
	departmentChain: [],
	schedules: [],
	...over
});

describe('scheduleHistory (RO12)', () => {
	it('gives one open period for one team plan', () => {
		const history = scheduleHistory(
			base({ teamAssignments: [teamPlan('a1', 'tA', '2030-01-01', null)] })
		);
		expect(history).toEqual([
			{
				from: '2030-01-01',
				to: null,
				source: 'team',
				teamId: 'tA',
				departmentId: null,
				assignmentId: 'a1',
				patternId: 'p-a1',
				anchorDate: '2030-01-01',
				crewStart: null,
				offWeekdays: null,
				ruleReason: null
			}
		]);
	});

	it('splits on a monthly pattern change on the 1st, newest first', () => {
		const history = scheduleHistory(
			base({
				teamAssignments: [
					teamPlan('jan', 'tA', '2030-01-01', '2030-02-01'),
					teamPlan('feb', 'tA', '2030-02-01', null)
				],
				schedules: [crew(8, '2030-01-01', null)]
			})
		);
		expect(history.map((p) => [p.from, p.to, p.patternId, p.crewStart])).toEqual([
			['2030-02-01', null, 'p-feb', 8],
			['2030-01-01', '2030-02-01', 'p-jan', 8]
		]);
		expect(history[0].ruleReason).toBe('Made-up reason');
	});

	it('splits on a crew start change mid-month', () => {
		const history = scheduleHistory(
			base({
				teamAssignments: [teamPlan('a1', 'tA', '2030-01-01', null)],
				schedules: [crew(4, '2030-01-01', '2030-01-15'), crew(12, '2030-01-15', null)]
			})
		);
		expect(history.map((p) => [p.from, p.to, p.crewStart])).toEqual([
			['2030-01-15', null, 12],
			['2030-01-01', '2030-01-15', 4]
		]);
	});

	it('follows a team move from the first 00:00 after it', () => {
		const moveAt = new Date(startOfDamascusDay('2030-01-20').getTime() + 9 * 3_600_000);
		const history = scheduleHistory(
			base({
				memberships: [
					{ teamId: 'tA', validFrom: startOfDamascusDay('2030-01-01'), validTo: moveAt },
					{ teamId: 'tB', validFrom: moveAt, validTo: null }
				],
				teamAssignments: [
					teamPlan('a1', 'tA', '2030-01-01', null),
					teamPlan('b1', 'tB', '2030-01-01', null)
				]
			})
		);
		expect(history.map((p) => [p.from, p.to, p.teamId, p.assignmentId])).toEqual([
			['2030-01-21', null, 'tB', 'b1'],
			['2030-01-01', '2030-01-21', 'tA', 'a1']
		]);
	});

	it('starts at the first membership, not at an earlier team plan', () => {
		const history = scheduleHistory(
			base({
				memberships: [{ teamId: 'tA', validFrom: startOfDamascusDay('2030-01-10'), validTo: null }],
				teamAssignments: [teamPlan('a1', 'tA', '2029-12-01', null)]
			})
		);
		expect(history.map((p) => [p.from, p.to])).toEqual([['2030-01-10', null]]);
		expect(inPeriod(history[0], '2030-01-09')).toBe(false);
		expect(inPeriod(history[0], '2030-01-10')).toBe(true);
	});

	it('lets a personal plan win and ignores own rules under it', () => {
		const personal = { ...teamPlan('me', 'x', '2030-01-05', '2030-01-08'), teamId: null };
		const history = scheduleHistory(
			base({
				teamAssignments: [teamPlan('a1', 'tA', '2030-01-01', null)],
				personalAssignments: [personal],
				schedules: [crew(2, '2030-01-01', null)]
			})
		);
		expect(history.map((p) => [p.from, p.source, p.crewStart])).toEqual([
			['2030-01-08', 'team', 2],
			['2030-01-05', 'personal', null],
			['2030-01-01', 'team', 2]
		]);
	});
});
