import { describe, expect, it } from 'vitest';
import {
	approvalState,
	computeOvertime,
	formatHoursMinutes,
	NO_ROUNDING,
	roundMinutes,
	toDecimalHours
} from './overtime.js';

const STEP_15 = { step: 15, mode: 'nearest' } as const;

describe('roundMinutes', () => {
	it('does not round with no step (Odoo, OC7)', () => {
		expect(roundMinutes(397, NO_ROUNDING)).toBe(397);
		expect(roundMinutes(7, NO_ROUNDING)).toBe(7);
	});

	it('rounds to the nearest step, half up', () => {
		expect([0, 7, 8, 15, 22, 23, 40, 130].map((n) => roundMinutes(n, STEP_15))).toEqual([
			0, 0, 15, 15, 15, 30, 45, 135
		]);
	});

	it('rounds up to the next step', () => {
		const up = { step: 15, mode: 'up' } as const;
		expect([0, 1, 15, 16, 30].map((n) => roundMinutes(n, up))).toEqual([0, 15, 15, 30, 30]);
	});

	it('rounds down to the step', () => {
		const down = { step: 15, mode: 'down' } as const;
		expect([0, 7, 14, 15, 29, 30].map((n) => roundMinutes(n, down))).toEqual([0, 0, 0, 15, 15, 30]);
	});

	it('works for other steps', () => {
		expect(roundMinutes(25, { step: 10, mode: 'nearest' })).toBe(30);
		expect(roundMinutes(26, { step: 5, mode: 'down' })).toBe(25);
		expect(roundMinutes(26, { step: 30, mode: 'up' })).toBe(30);
	});
});

describe('computeOvertime', () => {
	it('counts time past the required minutes on a rostered shift, unrounded by default', () => {
		expect(computeOvertime(720, 720, false)).toEqual({ rawMinutes: 0, minutes: 0, warning: false });
		expect(computeOvertime(727, 720, false).minutes).toBe(7);
		expect(computeOvertime(728, 720, false).minutes).toBe(8);
		expect(computeOvertime(760, 720, false)).toEqual({
			rawMinutes: 40,
			minutes: 40,
			warning: false
		});
		expect(computeOvertime(660, 720, false).minutes).toBe(0);
	});

	it('rounds when the day has a step', () => {
		expect(computeOvertime(727, 720, false, STEP_15).minutes).toBe(0);
		expect(computeOvertime(728, 720, false, STEP_15).minutes).toBe(15);
		expect(computeOvertime(760, 720, false, STEP_15)).toEqual({
			rawMinutes: 40,
			minutes: 45,
			warning: false
		});
	});

	it('counts past a shorter required time', () => {
		expect(computeOvertime(480, 480, false).minutes).toBe(0);
		expect(computeOvertime(540, 480, false)).toEqual({
			rawMinutes: 60,
			minutes: 60,
			warning: false
		});
		expect(computeOvertime(530, 480, false, STEP_15).minutes).toBe(45);
	});

	it('counts all of an extra shift', () => {
		expect(computeOvertime(720, 720, true).minutes).toBe(720);
		expect(computeOvertime(790, 720, true, STEP_15).minutes).toBe(795);
	});

	it('warns above 18 h worked', () => {
		expect(computeOvertime(1080, 720, false).warning).toBe(false);
		expect(computeOvertime(1081, 720, false).warning).toBe(true);
		expect(computeOvertime(1110, 720, false)).toEqual({
			rawMinutes: 390,
			minutes: 390,
			warning: true
		});
	});
});

describe('approvalState', () => {
	it('tells pending, approved and changed apart', () => {
		expect(approvalState(0, null)).toBe('none');
		expect(approvalState(45, null)).toBe('pending');
		expect(approvalState(45, { minutes: 45 })).toBe('approved');
		expect(approvalState(60, { minutes: 45 })).toBe('changed');
		expect(approvalState(0, { minutes: 45 })).toBe('changed');
	});
});

describe('formatting', () => {
	it('shows decimal hours and h:mm', () => {
		expect(toDecimalHours(135)).toBe(2.25);
		expect(formatHoursMinutes(135)).toBe('2:15');
		expect(formatHoursMinutes(45)).toBe('0:45');
		expect(formatHoursMinutes(720)).toBe('12:00');
	});
});
