import { describe, expect, it } from 'vitest';
import { averageWeeklyMinutes } from './pattern-stats.js';
import { SHIFTS, slots } from './test-shifts.js';

describe('averageWeeklyMinutes', () => {
	it('sums a weekly pattern', () => {
		// Five 12 h day shifts.
		expect(averageWeeklyMinutes({ type: 'weekly', slots: slots('D D D D D O O') }, SHIFTS)).toBe(
			5 * 720
		);
	});

	it('scales a cycle to 7 days (D D N N O O O O: 42 h)', () => {
		expect(averageWeeklyMinutes({ type: 'cycle', slots: slots('D D N N O O O O') }, SHIFTS)).toBe(
			42 * 60
		);
	});

	it('uses required minutes (E: 690) and ignores unknown ids', () => {
		expect(averageWeeklyMinutes({ type: 'cycle', slots: ['E', 'X'] }, SHIFTS)).toBe(
			Math.round((690 * 7) / 2)
		);
	});
});
