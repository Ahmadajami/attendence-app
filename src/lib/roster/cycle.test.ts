import { describe, expect, it } from 'vitest';
import type { ShiftKind } from '#lib/schemas/enums.js';
import {
	addDays,
	cycleIndex,
	cycleKind,
	damascusDate,
	daysBetween,
	shiftWindow,
	startOfDamascusDay
} from './cycle.js';

const TIMES = { dayStart: '07:00', nightStart: '19:00' };
const kinds = (s: string): ShiftKind[] =>
	s.split(' ').map((k) => (k === 'D' ? 'day' : k === 'N' ? 'night' : 'off'));
/** The cycle's letters (D / N / O) for `days` dates from `from`. */
const run = (cycle: ShiftKind[], anchor: string, from: string, days: number) =>
	Array.from({ length: days }, (_, i) =>
		cycleKind(cycle, anchor, addDays(from, i))[0].toUpperCase()
	).join(' ');

describe('calendar helpers', () => {
	it('counts and adds days across month and year ends', () => {
		expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
		expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3);
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('uses the Damascus date of an instant (UTC+3)', () => {
		expect(damascusDate(new Date('2026-11-05T20:59:59Z'))).toBe('2026-11-05');
		expect(damascusDate(new Date('2026-11-05T21:00:00Z'))).toBe('2026-11-06');
		expect(startOfDamascusDay('2026-11-06').toISOString()).toBe('2026-11-05T21:00:00.000Z');
	});
});

describe('cycleKind', () => {
	// 2026-11-02 is a Monday.
	it('runs a 3-day 12/24 cycle (D N O)', () => {
		expect(run(kinds('D N O'), '2026-11-02', '2026-11-02', 6)).toBe('D N O D N O');
	});

	it('runs a 4-day 12/24/12/48 cycle (D N O O)', () => {
		expect(run(kinds('D N O O'), '2026-11-02', '2026-11-02', 8)).toBe('D N O O D N O O');
	});

	it('runs a 7-day week', () => {
		expect(run(kinds('D D D D D O O'), '2026-11-02', '2026-11-02', 9)).toBe('D D D D D O O D D');
	});

	it('runs an 8-day continental cycle', () => {
		expect(run(kinds('D D N N O O O O'), '2026-11-02', '2026-11-02', 10)).toBe(
			'D D N N O O O O D D'
		);
	});

	it('repeats backwards before the anchor', () => {
		expect(run(kinds('D N O O'), '2026-11-02', '2026-10-29', 4)).toBe('D N O O');
		expect(run(kinds('D D N N O O O O'), '2026-11-02', '2026-10-25', 8)).toBe('D D N N O O O O');
		expect(cycleIndex('2026-11-02', 3, '2026-11-01')).toBe(2);
	});

	it('handles a 1-day and a 28-day cycle', () => {
		expect(run(kinds('N'), '2026-11-02', '2026-10-01', 3)).toBe('N N N');
		const long = [...kinds('D'), ...Array<ShiftKind>(27).fill('off')];
		expect(cycleKind(long, '2026-11-02', '2026-11-30')).toBe('day');
		expect(cycleKind(long, '2026-11-02', '2026-11-29')).toBe('off');
	});
});

describe('shiftWindow', () => {
	it('places a day shift on its date, 12 h long', () => {
		const w = shiftWindow('2026-11-05', 'day', TIMES);
		expect(w.start.toISOString()).toBe('2026-11-05T04:00:00.000Z');
		expect(w.end.toISOString()).toBe('2026-11-05T16:00:00.000Z');
	});

	it('ends a night shift the next morning, across a month end', () => {
		const w = shiftWindow('2026-10-31', 'night', { dayStart: '07:00:00', nightStart: '19:00:00' });
		expect(w.start.toISOString()).toBe('2026-10-31T16:00:00.000Z');
		expect(w.end.toISOString()).toBe('2026-11-01T04:00:00.000Z');
		expect(damascusDate(w.end)).toBe('2026-11-01');
	});

	it('follows the times saved on the version', () => {
		const w = shiftWindow('2026-11-05', 'day', { dayStart: '06:30', nightStart: '18:30' });
		expect(w.start.toISOString()).toBe('2026-11-05T03:30:00.000Z');
	});
});
