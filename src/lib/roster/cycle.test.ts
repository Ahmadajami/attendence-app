import { describe, expect, it } from 'vitest';
import {
	addDays,
	damascusDate,
	daysBetween,
	mostUsedShift,
	patternSlot,
	startOfDamascusDay,
	weekdayOf
} from './cycle.js';
import { letter, slots } from './test-shifts.js';

/** The pattern's letters (shift code / O) for `days` dates from `from`. */
const run = (
	codes: string,
	from: string,
	days: number,
	type: 'cycle' | 'weekly' = 'cycle',
	anchorDate: string | null = '2026-11-02',
	crewStart = 0
) =>
	Array.from({ length: days }, (_, i) =>
		letter(patternSlot({ type, slots: slots(codes), anchorDate }, addDays(from, i), crewStart))
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

describe('patternSlot: cycle', () => {
	// 2026-11-02 is a Monday.
	it('runs a 3-day 12/24 cycle (D N O)', () => {
		expect(run('D N O', '2026-11-02', 6)).toBe('D N O D N O');
	});

	it('runs a 4-day 12/24/12/48 cycle (D N O O)', () => {
		expect(run('D N O O', '2026-11-02', 8)).toBe('D N O O D N O O');
	});

	it('runs a 7-day cycle', () => {
		expect(run('D D D D D O O', '2026-11-02', 9)).toBe('D D D D D O O D D');
	});

	it('runs an 8-day continental cycle', () => {
		expect(run('D D N N O O O O', '2026-11-02', 10)).toBe('D D N N O O O O D D');
	});

	it('repeats backwards before the anchor', () => {
		expect(run('D N O O', '2026-10-29', 4)).toBe('D N O O');
		expect(run('D D N N O O O O', '2026-10-25', 8)).toBe('D D N N O O O O');
		expect(run('D N O', '2026-11-01', 1)).toBe('O');
	});

	it('handles a 1-day and a 28-day cycle', () => {
		expect(run('N', '2026-10-01', 3)).toBe('N N N');
		const long = ['D', ...Array<string>(27).fill('O')].join(' ');
		expect(run(long, '2026-11-30', 1)).toBe('D');
		expect(run(long, '2026-11-29', 1)).toBe('O');
	});

	it('mixes a non-12 h shift into a cycle', () => {
		expect(run('E E O', '2026-11-02', 6)).toBe('E E O E E O');
	});
});

describe('patternSlot: weekly', () => {
	// Sun → Sat: D on weekdays Sunday–Thursday, off Friday and Saturday.
	const week = 'D D D D D O O';

	it('follows the weekday, Sunday first, whatever the anchor', () => {
		// 2026-11-01 is a Sunday.
		expect(run(week, '2026-11-01', 9, 'weekly', null)).toBe('D D D D D O O D D');
		expect(run(week, '2026-11-06', 2, 'weekly', null)).toBe('O O');
	});

	it('repeats the same way in the past', () => {
		expect(run(week, '2026-10-02', 3, 'weekly', null)).toBe('O O D');
	});
});

describe('patternSlot: crew start', () => {
	const cycle = 'D D N N O O O O';

	it('moves a person that many slots into the cycle', () => {
		// Anchor Monday 2 Nov: crew start 2 begins on the anchor with slot 2.
		expect(run(cycle, '2026-11-02', 8, 'cycle', '2026-11-02', 2)).toBe('N N O O O O D D');
		expect(run(cycle, '2026-11-02', 8, 'cycle', '2026-11-02', 6)).toBe('O O D D N N O O');
	});

	it('works before the anchor too', () => {
		// 30 Oct is 3 days before the anchor: slot 5, + crew start 2 = slot 7.
		expect(run(cycle, '2026-10-30', 3, 'cycle', '2026-11-02', 2)).toBe('O D D');
		expect(run(cycle, '2026-10-30', 3, 'cycle', '2026-11-02', 0)).toBe('O O O');
	});

	it('wraps a crew start of the cycle length to the start', () => {
		expect(run(cycle, '2026-11-02', 4, 'cycle', '2026-11-02', 8)).toBe(run(cycle, '2026-11-02', 4));
	});

	it('is ignored by weekly patterns', () => {
		expect(run('D D D D D O O', '2026-11-01', 7, 'weekly', null, 3)).toBe('D D D D D O O');
	});
});

describe('weekdayOf and mostUsedShift', () => {
	it('numbers weekdays from Sunday = 0', () => {
		expect(weekdayOf('2026-11-01')).toBe(0);
		expect(weekdayOf('2026-11-07')).toBe(6);
	});

	it('picks the shift a pattern uses most, the earliest on a tie', () => {
		expect(mostUsedShift(slots('N D D O'))).toBe('D');
		expect(mostUsedShift(slots('N D O O'))).toBe('N');
		expect(mostUsedShift(slots('O O'))).toBeNull();
	});
});
