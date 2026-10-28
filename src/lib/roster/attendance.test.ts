import { describe, expect, it } from 'vitest';
import type { AttendanceEventType, ShiftKind } from '#lib/schemas/enums.js';
import {
	attributeEvent,
	effectiveEvents,
	shiftSummary,
	type AttendanceEntry,
	type Attribution
} from './attendance.js';
import { addDays, damascusDate, startOfDamascusDay } from './cycle.js';
import { rosterDay, rosterRange, type RosterInput } from './roster.js';

/** Damascus wall-clock time as an instant (UTC+3). */
const at = (local: string) => new Date(`${local}:00+03:00`);

// D N O O from Monday 2 Nov: 2 Nov day, 3 Nov night, 4–5 Nov off, 6 Nov day…
const input: RosterInput = {
	memberships: [{ teamId: 'team-a', validFrom: startOfDamascusDay('2026-01-01'), validTo: null }],
	personalPatterns: [],
	teamPatterns: [
		{
			teamId: 'team-a',
			cycle: ['day', 'night', 'off', 'off'],
			anchorDate: '2026-11-02',
			dayStart: '07:00:00',
			nightStart: '19:00:00',
			effectiveFrom: '2026-01-01',
			effectiveTo: null
		}
	],
	overrides: [],
	absences: [],
	fallbackTimes: { dayStart: '07:00', nightStart: '19:00' }
};

const around = (when: Date, roster: RosterInput = input) =>
	rosterRange(roster, addDays(damascusDate(when), -1), 3);

const attribute = (
	local: string,
	type: AttendanceEventType,
	open: Attribution | null = null,
	roster: RosterInput = input
) => attributeEvent(at(local), type, around(at(local), roster), open);

let nextId = 0;
const ev = (
	type: AttendanceEventType,
	local: string,
	shiftKind: Exclude<ShiftKind, 'off'> = 'day',
	correctsEventId: string | null = null
): AttendanceEntry => ({
	id: `e${++nextId}`,
	type,
	occurredAt: at(local),
	shiftKind,
	correctsEventId
});

describe('attributeEvent', () => {
	it('counts a night check-out the next morning for the night before', () => {
		expect(attribute('2026-11-03T18:50', 'check_in')).toEqual({
			shiftDate: '2026-11-03',
			shiftKind: 'night',
			scheduled: true
		});
		expect(attribute('2026-11-04T07:05', 'check_out')).toEqual({
			shiftDate: '2026-11-03',
			shiftKind: 'night',
			scheduled: true
		});
	});

	it('opens the window 2 h before the start', () => {
		expect(attribute('2026-11-03T17:00', 'check_in')?.scheduled).toBe(true);
		expect(attribute('2026-11-03T16:59', 'check_in')).toMatchObject({
			shiftDate: '2026-11-03',
			shiftKind: 'day',
			scheduled: false
		});
	});

	it('closes the window 7 h after the end', () => {
		expect(attribute('2026-11-04T14:00', 'check_out')).toMatchObject({
			shiftDate: '2026-11-03',
			shiftKind: 'night',
			scheduled: true
		});
		expect(attribute('2026-11-04T14:01', 'check_out')?.scheduled).toBe(false);
	});

	it('fits an unscheduled check-in to the nearest airport shift', () => {
		expect(attribute('2026-11-05T07:00', 'check_in')).toEqual({
			shiftDate: '2026-11-05',
			shiftKind: 'day',
			scheduled: false
		});
		expect(attribute('2026-11-05T18:40', 'check_in')).toEqual({
			shiftDate: '2026-11-05',
			shiftKind: 'night',
			scheduled: false
		});
	});

	it('keeps a check-out with the open check-in', () => {
		const open = attribute('2026-11-05T07:00', 'check_in');
		// 22:30 is closer to the night's start than the day's end, but the day shift is still open.
		expect(attribute('2026-11-05T22:30', 'check_out', open)).toEqual(open);
	});

	it('counts an extra shift as scheduled', () => {
		const roster: RosterInput = {
			...input,
			overrides: [{ shiftDate: '2026-11-04', kind: 'day', swapGroupId: null }]
		};
		expect(attribute('2026-11-04T06:55', 'check_in', null, roster)).toEqual({
			shiftDate: '2026-11-04',
			shiftKind: 'day',
			scheduled: true
		});
	});

	it('returns null when no shift times are known', () => {
		const roster: RosterInput = { ...input, memberships: [], fallbackTimes: null };
		expect(attribute('2026-11-05T07:00', 'check_in', null, roster)).toBeNull();
	});
});

describe('effectiveEvents', () => {
	it('replaces a corrected event and sorts by time', () => {
		const wrong = ev('check_in', '2026-11-02T07:40');
		const out = ev('check_out', '2026-11-02T19:00');
		const fix = ev('check_in', '2026-11-02T07:00', 'day', wrong.id);
		expect(effectiveEvents([out, wrong, fix]).map((e) => e.id)).toEqual([fix.id, out.id]);
	});
});

describe('shiftSummary', () => {
	const day2 = rosterDay(input, '2026-11-02'); // Day shift 07:00–19:00
	const night3 = rosterDay(input, '2026-11-03'); // Night shift 19:00–07:00
	const later = at('2026-11-10T12:00');

	it('counts breaks as worked time and rounds the overtime', () => {
		const s = shiftSummary(
			day2,
			[
				ev('check_in', '2026-11-02T07:00'),
				ev('break_start', '2026-11-02T12:00'),
				ev('break_end', '2026-11-02T13:00'),
				ev('check_out', '2026-11-02T21:10')
			],
			later
		);
		expect(s).toMatchObject({
			status: 'done',
			kind: 'day',
			workedMinutes: 850,
			short: false,
			overtime: { rawMinutes: 130, minutes: 135, warning: false },
			approval: 'pending'
		});
	});

	it('is late only after 15 min', () => {
		const now = at('2026-11-02T08:00');
		expect(shiftSummary(day2, [ev('check_in', '2026-11-02T07:15')], now)).toMatchObject({
			status: 'present',
			lateMinutes: 15
		});
		expect(shiftSummary(day2, [ev('check_in', '2026-11-02T07:16')], now)).toMatchObject({
			status: 'late',
			lateMinutes: 16
		});
	});

	it('is expected until 15 min after the start, then missing', () => {
		expect(shiftSummary(day2, [], at('2026-11-02T06:00')).status).toBe('expected');
		expect(shiftSummary(day2, [], at('2026-11-02T07:15')).status).toBe('expected');
		expect(shiftSummary(day2, [], at('2026-11-02T07:16')).status).toBe('missing');
	});

	it('shows a break in progress', () => {
		const s = shiftSummary(
			day2,
			[ev('check_in', '2026-11-02T07:00'), ev('break_start', '2026-11-02T12:00')],
			at('2026-11-02T12:10')
		);
		expect(s).toMatchObject({ status: 'on_break', workedMinutes: null, overtime: null });
	});

	it('flags a short day', () => {
		const s = shiftSummary(
			day2,
			[ev('check_in', '2026-11-02T07:00'), ev('check_out', '2026-11-02T18:00')],
			later
		);
		expect(s).toMatchObject({
			workedMinutes: 660,
			short: true,
			overtime: { minutes: 0 },
			approval: 'none'
		});
	});

	it('makes up a late start before any overtime', () => {
		const s = shiftSummary(
			day2,
			[ev('check_in', '2026-11-02T07:30'), ev('check_out', '2026-11-02T19:30')],
			later
		);
		expect(s).toMatchObject({ workedMinutes: 720, lateMinutes: 30, overtime: { minutes: 0 } });
	});

	it('counts a night stay past the morning as Night overtime', () => {
		const s = shiftSummary(
			night3,
			[ev('check_in', '2026-11-03T19:00', 'night'), ev('check_out', '2026-11-04T08:40', 'night')],
			later
		);
		expect(s).toMatchObject({ kind: 'night', workedMinutes: 820, overtime: { minutes: 105 } });
	});

	it('counts all of an extra shift, none of a swapped one', () => {
		const events = [ev('check_in', '2026-11-04T07:00'), ev('check_out', '2026-11-04T19:00')];
		const extra = rosterDay(
			{ ...input, overrides: [{ shiftDate: '2026-11-04', kind: 'day', swapGroupId: null }] },
			'2026-11-04'
		);
		const swapped = rosterDay(
			{ ...input, overrides: [{ shiftDate: '2026-11-04', kind: 'day', swapGroupId: 's1' }] },
			'2026-11-04'
		);
		expect(shiftSummary(extra, events, later)).toMatchObject({
			status: 'done',
			short: false,
			overtime: { minutes: 720 }
		});
		expect(shiftSummary(swapped, events, later)).toMatchObject({ overtime: { minutes: 0 } });
	});

	it('counts an unscheduled day as overtime', () => {
		const off = rosterDay(input, '2026-11-05');
		const s = shiftSummary(
			off,
			[ev('check_in', '2026-11-05T07:00'), ev('check_out', '2026-11-05T19:00')],
			later
		);
		expect(s).toMatchObject({
			status: 'unscheduled',
			kind: 'day',
			lateMinutes: 0,
			short: false,
			overtime: { minutes: 720 }
		});
	});

	it('is off or absent with no events', () => {
		expect(shiftSummary(rosterDay(input, '2026-11-05'), [], later)).toMatchObject({
			status: 'off',
			kind: null,
			overtime: null
		});
		const absent = rosterDay(
			{ ...input, absences: [{ startsOn: '2026-11-02', endsOn: '2026-11-02', type: 'sick' }] },
			'2026-11-02'
		);
		expect(shiftSummary(absent, [], later).status).toBe('absent');
	});

	it('warns above 18 h worked', () => {
		const s = shiftSummary(
			day2,
			[ev('check_in', '2026-11-02T07:00'), ev('check_out', '2026-11-03T01:30')],
			later
		);
		expect(s).toMatchObject({ workedMinutes: 1110, overtime: { minutes: 390, warning: true } });
	});

	it('shows an approval as changed after a correction', () => {
		const out = ev('check_out', '2026-11-02T21:10');
		const events = [ev('check_in', '2026-11-02T07:00'), out];
		expect(shiftSummary(day2, events, later, { minutes: 135 }).approval).toBe('approved');
		const fix = ev('check_out', '2026-11-02T21:40', 'day', out.id);
		const s = shiftSummary(day2, [...events, fix], later, { minutes: 135 });
		expect(s).toMatchObject({
			workedMinutes: 880,
			overtime: { minutes: 165 },
			approval: 'changed'
		});
	});
});
