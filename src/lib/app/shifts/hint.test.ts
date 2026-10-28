import { describe, expect, it } from 'vitest';
import { shiftHint, splitDuration } from './hint.js';

describe('shiftHint', () => {
	it('ends 16:00 → 04:00 the next day, 720 min, night', () => {
		expect(shiftHint('16:00', '04:00', 0, null)).toEqual({
			endsNextDay: true,
			spanMinutes: 720,
			requiredMinutes: 720,
			night: true
		});
	});

	it('makes 08:00 → 08:00 a full day', () => {
		expect(shiftHint('08:00', '08:00', 0, null)).toMatchObject({
			endsNextDay: true,
			spanMinutes: 1440
		});
	});

	it('keeps 00:00 → 08:00 on the same day, 480 min', () => {
		expect(shiftHint('00:00', '08:00', 0, null)).toMatchObject({
			endsNextDay: false,
			spanMinutes: 480,
			night: true
		});
	});

	it('subtracts the break unless required is set', () => {
		expect(shiftHint('07:00', '19:00', 30, null)?.requiredMinutes).toBe(690);
		expect(shiftHint('07:00', '19:00', 30, 600)?.requiredMinutes).toBe(600);
		expect(shiftHint('07:00', '19:00', 0, null)?.night).toBe(false);
	});

	it('waits for complete times', () => {
		expect(shiftHint('7:0', '19:00', 0, null)).toBeNull();
		expect(shiftHint('', '', 0, null)).toBeNull();
	});
});

describe('splitDuration', () => {
	it('splits minutes into hours and minutes', () => {
		expect(splitDuration(720)).toEqual({ hours: 12, minutes: 0 });
		expect(splitDuration(450)).toEqual({ hours: 7, minutes: 30 });
	});
});
