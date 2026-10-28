import { describe, expect, it } from 'vitest';
import { damascusDate } from './cycle.js';
import {
	attributionWindow,
	endsNextDay,
	graceOf,
	isNightShift,
	requiredOf,
	shiftWindow,
	spanOf
} from './shift.js';
import { D, E, N } from './test-shifts.js';

describe('shiftWindow', () => {
	it('places a day shift on its date, 12 h long', () => {
		const w = shiftWindow('2026-11-05', D);
		expect(w.start.toISOString()).toBe('2026-11-05T04:00:00.000Z');
		expect(w.end.toISOString()).toBe('2026-11-05T16:00:00.000Z');
	});

	it('ends a night shift the next morning, across a month end', () => {
		const w = shiftWindow('2026-10-31', N);
		expect(w.start.toISOString()).toBe('2026-10-31T16:00:00.000Z');
		expect(w.end.toISOString()).toBe('2026-11-01T04:00:00.000Z');
		expect(damascusDate(w.end)).toBe('2026-11-01');
	});

	it("follows the shift's own times", () => {
		const w = shiftWindow('2026-11-05', { startTime: '06:30', endTime: '18:30' });
		expect(w.start.toISOString()).toBe('2026-11-05T03:30:00.000Z');
	});

	it('ends a 16 → 04 shift at 04:00 the next day', () => {
		const w = shiftWindow('2026-11-05', E);
		expect(w.start.toISOString()).toBe('2026-11-05T13:00:00.000Z');
		expect(w.end.toISOString()).toBe('2026-11-06T01:00:00.000Z'); // 04:00 Damascus on the 6th
	});

	it('takes the time zone as a parameter', () => {
		expect(shiftWindow('2026-11-05', D, 'UTC').start.toISOString()).toBe(
			'2026-11-05T07:00:00.000Z'
		);
	});
});

describe('shift figures', () => {
	it('computes span, next day, night, required and grace', () => {
		expect([spanOf(D), spanOf(N), spanOf(E)]).toEqual([720, 720, 720]);
		expect([endsNextDay(D), endsNextDay(N), endsNextDay(E)]).toEqual([false, true, true]);
		expect([isNightShift(D), isNightShift(N), isNightShift(E)]).toEqual([false, true, true]);
		expect([requiredOf(D), requiredOf(E)]).toEqual([720, 690]);
		expect(requiredOf({ ...D, requiredMinutes: 480 })).toBe(480);
		expect([graceOf(D), graceOf({ graceMinutes: 5 })]).toEqual([15, 5]);
	});

	it("widens the attribution window by the shift's minutes before and after", () => {
		const w = attributionWindow('2026-11-05', N);
		expect(w.start.toISOString()).toBe('2026-11-05T13:00:00.000Z'); // 16:00, 3 h before 19:00
		expect(w.end.toISOString()).toBe('2026-11-06T10:00:00.000Z'); // 13:00, 6 h after 07:00
	});
});
