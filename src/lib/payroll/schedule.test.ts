// The 11 cases of `docs/reference/schedule_spec/test_schedule.py`, 1:1. The spec takes float
// hours; here `h()` converts them so each case reads like the original.
import { describe, expect, it } from 'vitest';
import {
	crossesMidnight,
	formatClock,
	isNight,
	overlapMinutes,
	parseClock,
	requiredMinutes,
	slotIndex,
	spanMinutes,
	toMinutes
} from './schedule.js';

const h = toMinutes;

/** A Sunday, so weekly slot 0 is easy to read. */
const SUNDAY = '2026-01-04';

function plusDays(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

describe('schedule (spec)', () => {
	it('overnight span 16 → 4', () => {
		expect(crossesMidnight(h(16), h(4))).toBe(true);
		expect(spanMinutes(h(16), h(4))).toBe(720);
	});

	it('a midnight start does not cross', () => {
		expect(crossesMidnight(h(0), h(8))).toBe(false);
		expect(spanMinutes(h(0), h(8))).toBe(480);
	});

	it('end equal to start is a full day', () => {
		expect(crossesMidnight(h(8), h(8))).toBe(true);
		expect(spanMinutes(h(8), h(8))).toBe(1440);
	});

	it('fractional hours', () => {
		expect(spanMinutes(h(7.5), h(19.25))).toBe(705);
		expect(spanMinutes(h(19.0), h(7.0))).toBe(720);
	});

	it('required is span minus break', () => {
		expect(requiredMinutes(720, 0)).toBe(720);
		expect(requiredMinutes(720, 60)).toBe(660);
		expect(requiredMinutes(30, 60)).toBe(0);
	});

	it('night overlap', () => {
		expect(overlapMinutes(h(16), h(4), h(22), h(6))).toBe(360);
		expect(overlapMinutes(h(0), h(8), h(22), h(6))).toBe(360);
		expect(overlapMinutes(h(8), h(17), h(22), h(6))).toBe(0);
		expect(overlapMinutes(h(20), h(23), h(22), h(6))).toBe(60);
	});

	it('is night', () => {
		expect(isNight(h(16), h(4), h(22), h(6))).toBe(true); // crosses midnight
		expect(isNight(h(0), h(8), h(22), h(6))).toBe(true); // 360 of 480 at night
		expect(isNight(h(8), h(17), h(22), h(6))).toBe(false);
		expect(isNight(h(14), h(22), h(22), h(6))).toBe(false);
	});

	it('a weekly slot is the weekday', () => {
		for (let offset = 0; offset < 14; offset++) {
			expect(slotIndex('weekly', 7, plusDays(SUNDAY, offset))).toBe(offset % 7);
		}
	});

	it('cycle slot after the anchor', () => {
		for (const [offset, expected] of [
			[0, 0],
			[1, 1],
			[7, 7],
			[8, 0],
			[17, 1]
		]) {
			expect(slotIndex('cycle', 8, plusDays(SUNDAY, offset), SUNDAY)).toBe(expected);
		}
	});

	it('cycle slot before the anchor (floor modulo)', () => {
		for (const [offset, expected] of [
			[-1, 7],
			[-8, 0],
			[-9, 7],
			[-3, 5]
		]) {
			expect(slotIndex('cycle', 8, plusDays(SUNDAY, offset), SUNDAY)).toBe(expected);
		}
	});

	it('a cycle needs an anchor', () => {
		expect(() => slotIndex('cycle', 4, SUNDAY)).toThrow();
	});
});

describe('clock helpers', () => {
	it('reads and writes HH:mm', () => {
		expect(parseClock('07:00')).toBe(420);
		expect(parseClock('19:30:00')).toBe(1170);
		expect(formatClock(1170)).toBe('19:30');
		expect(formatClock(0)).toBe('00:00');
	});
});
