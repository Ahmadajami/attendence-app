import { describe, expect, it } from 'vitest';
import type { AttendanceEventType } from '#lib/schemas/enums.js';
import {
	attributeEvent,
	effectiveEvents,
	shiftSummary,
	type AttendanceEntry,
	type Attribution
} from './attendance.js';
import { addDays, damascusDate, startOfDamascusDay } from './cycle.js';
import { rosterDay, rosterRange, type RosterInput } from './roster.js';
import type { RosterShift } from './shift.js';
import { D, E, N, SHIFTS, slots } from './test-shifts.js';

/** Damascus wall-clock time as an instant (UTC+3). */
const at = (local: string) => new Date(`${local}:00+03:00`);

/** The active shifts an unscheduled event may be counted for. */
const ACTIVE: RosterShift[] = [D, N, E];

// D N O O from Monday 2 Nov: 2 Nov day, 3 Nov night, 4–5 Nov off, 6 Nov day…
const input: RosterInput = {
	memberships: [{ teamId: 'team-a', validFrom: startOfDamascusDay('2026-01-01'), validTo: null }],
	personalPatterns: [],
	teamPatterns: [
		{
			teamId: 'team-a',
			departmentId: null,
			type: 'cycle',
			slots: slots('D N O O'),
			anchorDate: '2026-11-02',
			effectiveFrom: '2026-01-01',
			effectiveTo: null
		}
	],
	departmentPatterns: [],
	departmentChain: [],
	overrides: [],
	absences: [],
	shifts: SHIFTS
};

/** Every day on the 16:00 → 04:00 shift (break 30, required 690). */
const evenings: RosterInput = {
	...input,
	teamPatterns: [{ ...input.teamPatterns[0], slots: slots('E') }]
};

const around = (when: Date, roster: RosterInput = input) =>
	rosterRange(roster, addDays(damascusDate(when), -1), 3);

const attribute = (
	local: string,
	type: AttendanceEventType,
	open: Attribution | null = null,
	roster: RosterInput = input,
	candidates: RosterShift[] = ACTIVE
) => attributeEvent(at(local), type, around(at(local), roster), candidates, open);

let nextId = 0;
const ev = (
	type: AttendanceEventType,
	local: string,
	shiftId = 'D',
	correctsEventId: string | null = null
): AttendanceEntry => ({
	id: `e${++nextId}`,
	type,
	occurredAt: at(local),
	shiftId,
	correctsEventId,
	isVoid: false
});

describe('attributeEvent', () => {
	it('counts a night check-out the next morning for the night before', () => {
		expect(attribute('2026-11-03T18:50', 'check_in')).toEqual({
			shiftDate: '2026-11-03',
			shiftId: 'N',
			scheduled: true
		});
		expect(attribute('2026-11-04T07:05', 'check_out')).toEqual({
			shiftDate: '2026-11-03',
			shiftId: 'N',
			scheduled: true
		});
	});

	it('counts a 07:00 check-out after a night for the previous day', () => {
		expect(attribute('2026-11-04T07:00', 'check_out')).toEqual({
			shiftDate: '2026-11-03',
			shiftId: 'N',
			scheduled: true
		});
	});

	it("opens the window the shift's 3 h before its start", () => {
		expect(attribute('2026-11-03T16:00', 'check_in')?.scheduled).toBe(true);
		// Outside N's window: unscheduled, on the active shift that starts nearest (E at 16:00).
		expect(attribute('2026-11-03T15:59', 'check_in')).toMatchObject({
			shiftDate: '2026-11-03',
			shiftId: 'E',
			scheduled: false
		});
	});

	it("closes the window the shift's 6 h after its end", () => {
		expect(attribute('2026-11-04T13:00', 'check_out')).toMatchObject({
			shiftDate: '2026-11-03',
			shiftId: 'N',
			scheduled: true
		});
		expect(attribute('2026-11-04T13:01', 'check_out')?.scheduled).toBe(false);
	});

	it('fits an unscheduled check-in to the nearest active shift', () => {
		expect(attribute('2026-11-05T07:00', 'check_in')).toEqual({
			shiftDate: '2026-11-05',
			shiftId: 'D',
			scheduled: false
		});
		expect(attribute('2026-11-05T18:40', 'check_in')).toEqual({
			shiftDate: '2026-11-05',
			shiftId: 'N',
			scheduled: false
		});
		expect(attribute('2026-11-05T16:10', 'check_in')).toEqual({
			shiftDate: '2026-11-05',
			shiftId: 'E',
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
			overrides: [{ shiftDate: '2026-11-04', shiftId: 'D', swapGroupId: null }]
		};
		expect(attribute('2026-11-04T06:55', 'check_in', null, roster)).toEqual({
			shiftDate: '2026-11-04',
			shiftId: 'D',
			scheduled: true
		});
	});

	it('counts a 03:30 check-out on a 16 → 04 shift for the previous shift date', () => {
		expect(attribute('2026-11-06T03:30', 'check_out', null, evenings)).toEqual({
			shiftDate: '2026-11-05',
			shiftId: 'E',
			scheduled: true
		});
	});

	it('returns null when no shift fits', () => {
		const roster: RosterInput = { ...input, memberships: [] };
		expect(attribute('2026-11-05T07:00', 'check_in', null, roster, [])).toBeNull();
	});
});

describe('effectiveEvents', () => {
	it('replaces a corrected event and sorts by time', () => {
		const wrong = ev('check_in', '2026-11-02T07:40');
		const out = ev('check_out', '2026-11-02T19:00');
		const fix = ev('check_in', '2026-11-02T07:00', 'D', wrong.id);
		expect(effectiveEvents([out, wrong, fix]).map((e) => e.id)).toEqual([fix.id, out.id]);
	});

	it('drops an event voided by a correction, and the void itself', () => {
		const stray = ev('check_in', '2026-11-02T03:00');
		const keep = ev('check_in', '2026-11-02T07:00');
		const voided = { ...ev('check_in', '2026-11-02T03:00', 'D', stray.id), isVoid: true };
		expect(effectiveEvents([stray, keep, voided]).map((e) => e.id)).toEqual([keep.id]);
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
			shiftId: 'D',
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

	it('counts a night stay past the morning as overtime on the night', () => {
		const s = shiftSummary(
			night3,
			[ev('check_in', '2026-11-03T19:00', 'N'), ev('check_out', '2026-11-04T08:40', 'N')],
			later
		);
		expect(s).toMatchObject({ shiftId: 'N', workedMinutes: 820, overtime: { minutes: 105 } });
	});

	it('counts all of an extra shift, none of a swapped one', () => {
		const events = [ev('check_in', '2026-11-04T07:00'), ev('check_out', '2026-11-04T19:00')];
		const extra = rosterDay(
			{ ...input, overrides: [{ shiftDate: '2026-11-04', shiftId: 'D', swapGroupId: null }] },
			'2026-11-04'
		);
		const swapped = rosterDay(
			{ ...input, overrides: [{ shiftDate: '2026-11-04', shiftId: 'D', swapGroupId: 's1' }] },
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
			shiftId: 'D',
			lateMinutes: 0,
			short: false,
			overtime: { minutes: 720 }
		});
	});

	it('is off or absent with no events', () => {
		expect(shiftSummary(rosterDay(input, '2026-11-05'), [], later)).toMatchObject({
			status: 'off',
			shiftId: null,
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
		const fix = ev('check_out', '2026-11-02T21:40', 'D', out.id);
		const s = shiftSummary(day2, [...events, fix], later, { minutes: 135 });
		expect(s).toMatchObject({
			workedMinutes: 880,
			overtime: { minutes: 165 },
			approval: 'changed'
		});
	});

	it("uses the shift's own grace when it has one", () => {
		const strict = rosterDay(
			{ ...input, shifts: new Map([...SHIFTS, ['D', { ...D, graceMinutes: 5 }]]) },
			'2026-11-02'
		);
		const now = at('2026-11-02T08:00');
		expect(shiftSummary(strict, [ev('check_in', '2026-11-02T07:06')], now).status).toBe('late');
		expect(shiftSummary(strict, [], at('2026-11-02T07:06')).status).toBe('missing');
	});

	it("measures overtime and short days against the shift's required minutes", () => {
		const evening = rosterDay(evenings, '2026-11-05'); // E: 720 span, 30 break → 690
		const done = shiftSummary(
			evening,
			[ev('check_in', '2026-11-05T16:00', 'E'), ev('check_out', '2026-11-06T04:00', 'E')],
			later
		);
		expect(done).toMatchObject({ workedMinutes: 720, short: false, overtime: { minutes: 30 } });
		const short = shiftSummary(
			evening,
			[ev('check_in', '2026-11-05T16:00', 'E'), ev('check_out', '2026-11-06T03:00', 'E')],
			later
		);
		expect(short).toMatchObject({ workedMinutes: 660, short: true, overtime: { minutes: 0 } });
	});

	it('counts overtime past a 480 min required shift', () => {
		const eight = rosterDay(
			{ ...input, shifts: new Map([...SHIFTS, ['D', { ...D, requiredMinutes: 480 }]]) },
			'2026-11-02'
		);
		const s = shiftSummary(
			eight,
			[ev('check_in', '2026-11-02T07:00'), ev('check_out', '2026-11-02T16:00')],
			later
		);
		expect(s).toMatchObject({ workedMinutes: 540, short: false, overtime: { minutes: 60 } });
	});
});
