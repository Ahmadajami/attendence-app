import { describe, expect, it } from 'vitest';
import { leaveBalance, leaveDatesInYear, suggestCarry } from './balance.js';

// Made-up person; 1 Nov 2026 is a Sunday. Leave Sun 1 – Fri 6 Nov: Sunday is an off day.

const week = [
	{ date: '2026-11-01', plannedWork: false },
	{ date: '2026-11-02', plannedWork: true },
	{ date: '2026-11-03', plannedWork: true },
	{ date: '2026-11-04', plannedWork: true },
	{ date: '2026-11-05', plannedWork: true },
	{ date: '2026-11-06', plannedWork: true }
];

describe('leaveBalance', () => {
	it('T23: 21 yearly + 3 carried, 5 leave days on work days + 1 on an off day → 19 left', () => {
		expect(leaveBalance({ days: 21, carriedDays: 3 }, week, '2026-11-20')).toEqual({
			yearly: 21,
			carried: 3,
			taken: 5,
			booked: 0,
			left: 19
		});
	});

	it('T24: leave after today is booked, apart from taken, and still lowers the days left', () => {
		expect(leaveBalance({ days: 21, carriedDays: 0 }, week, '2026-11-03')).toEqual({
			yearly: 21,
			carried: 0,
			taken: 2,
			booked: 3,
			left: 16
		});
	});

	it('goes below zero (a warning, not a refusal) and works without an entitlement', () => {
		expect(leaveBalance(null, week, '2026-11-20')).toMatchObject({ yearly: 0, left: -5 });
		expect(leaveBalance({ days: 2.5, carriedDays: -0.5 }, week, '2026-11-20').left).toBe(-3);
	});
});

describe('leaveDatesInYear', () => {
	it('counts only leave, clipped to the year, without duplicates', () => {
		const dates = leaveDatesInYear(
			[
				{ startsOn: '2025-12-30', endsOn: '2026-01-02', type: 'leave' },
				{ startsOn: '2026-01-02', endsOn: '2026-01-03', type: 'leave' },
				{ startsOn: '2026-03-01', endsOn: '2026-03-05', type: 'sick' },
				{ startsOn: '2026-04-01', endsOn: '2026-04-01', type: 'mission' },
				{ startsOn: '2026-12-31', endsOn: '2027-01-02', type: 'leave' }
			],
			2026
		);
		expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-12-31']);
	});
});

describe('suggestCarry', () => {
	it("suggests last year's days left, or 0 when there was no balance", () => {
		const last = leaveBalance({ days: 21, carriedDays: 0 }, week, '2026-12-31');
		expect(suggestCarry(last)).toBe(16);
		expect(suggestCarry(null)).toBe(0);
	});
});
