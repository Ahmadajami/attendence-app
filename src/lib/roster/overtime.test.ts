import { describe, expect, it } from 'vitest';
import {
	approvalState,
	computeOvertime,
	formatHoursMinutes,
	roundOvertime,
	toDecimalHours
} from './overtime.js';

describe('roundOvertime', () => {
	it('rounds to the nearest 15 min, half up', () => {
		expect([0, 7, 8, 15, 22, 23, 40, 130].map(roundOvertime)).toEqual([
			0, 0, 15, 15, 15, 30, 45, 135
		]);
	});
});

describe('computeOvertime', () => {
	it('counts time past 12 h on a rostered shift', () => {
		expect(computeOvertime(720, false)).toEqual({ rawMinutes: 0, minutes: 0, warning: false });
		expect(computeOvertime(727, false).minutes).toBe(0);
		expect(computeOvertime(728, false).minutes).toBe(15);
		expect(computeOvertime(760, false)).toEqual({ rawMinutes: 40, minutes: 45, warning: false });
		expect(computeOvertime(660, false).minutes).toBe(0);
	});

	it('counts all of an extra shift', () => {
		expect(computeOvertime(720, true).minutes).toBe(720);
		expect(computeOvertime(790, true).minutes).toBe(795);
	});

	it('warns above 18 h worked', () => {
		expect(computeOvertime(1080, false).warning).toBe(false);
		expect(computeOvertime(1081, false).warning).toBe(true);
		expect(computeOvertime(1110, false)).toEqual({ rawMinutes: 390, minutes: 390, warning: true });
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
