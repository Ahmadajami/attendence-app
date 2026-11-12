import { describe, expect, it } from 'vitest';
import type { AttendanceEventType } from '#lib/schemas/enums.js';
import {
	ATTENDANCE_RULE_DEFAULTS,
	attendanceRulesOn,
	fridayPrayerCredit,
	isFriday,
	type AttendanceRuleVersion,
	type AttendanceRules
} from './attendance-rules.js';
import { shiftSummary, type AttendanceEntry } from './attendance.js';
import { startOfDamascusDay } from './cycle.js';
import { rosterDay, type RosterAbsence, type RosterInput } from './roster.js';
import { D, SHIFTS, slots } from './test-shifts.js';

// Made-up staff and punches only. Fridays: 6 Nov and 30 Oct 2026; 2 Nov 2026 is a Monday.

const at = (local: string) => new Date(`${local}:00+03:00`);
let nextId = 0;
const ev = (type: AttendanceEventType, local: string): AttendanceEntry => ({
	id: `e${++nextId}`,
	type,
	occurredAt: at(local),
	correctsEventId: null,
	isVoid: false
});

/** The day shift with 720 required minutes, so FP1's example reads as the brief gives it. */
const SHIFTS_720 = new Map(SHIFTS);
SHIFTS_720.set('D', { ...D, requiredMinutes: 720 });

const roster = (codes: string, absences: RosterAbsence[] = []): RosterInput => ({
	memberships: [{ teamId: 'team-a', validFrom: startOfDamascusDay('2026-01-01'), validTo: null }],
	personalAssignments: [],
	teamAssignments: [
		{
			id: 'a-team-a',
			patternId: 'p-test',
			teamId: 'team-a',
			departmentId: null,
			type: 'cycle',
			slots: slots(codes),
			defaultWorkShiftId: null,
			anchorDate: '2026-11-02',
			effectiveFrom: '2026-01-01',
			effectiveTo: null
		}
	],
	departmentAssignments: [],
	departmentChain: [],
	schedules: [],
	overrides: [],
	absences,
	shifts: SHIFTS_720
});

const WORK = roster('D D D D D');
const SAME_DAY_OFF_ON_FRIDAY = roster('D D D D O');
const NOW = at('2026-11-30T12:00');

const summary = (
	date: string,
	events: AttendanceEntry[],
	input: RosterInput = WORK,
	rules: AttendanceRules = ATTENDANCE_RULE_DEFAULTS
) => shiftSummary(rosterDay(input, date), events, NOW, null, rules);

/** FP1's example: 07:30–12:10 and 13:25–20:15, two segments, 690 worked. */
const twoSegments = (day: string, second = '20:15') => [
	ev('check_in', `${day}T07:30`),
	ev('check_out', `${day}T12:10`),
	ev('check_in', `${day}T13:25`),
	ev('check_out', `${day}T${second}`)
];

const oneSegment = (day: string) => [
	ev('check_in', `${day}T07:30`),
	ev('check_out', `${day}T15:30`)
];

describe('isFriday', () => {
	it('reads the calendar date', () => {
		expect(isFriday('2026-11-06')).toBe(true);
		expect(isFriday('2026-10-30')).toBe(true);
		expect(isFriday('2026-11-05')).toBe(false);
	});
});

describe('FP1 on a Friday with two segments', () => {
	it("gives the brief's example: worked 690, credit 60, no overtime, +30 extra", () => {
		const s = summary('2026-11-06', twoSegments('2026-11-06'));
		expect(s).toMatchObject({
			workedMinutes: 690,
			segments: 2,
			creditMinutes: 60,
			shortageMinutes: 0,
			creditExtraMinutes: 30,
			short: false
		});
		expect(s.overtime?.minutes).toBe(0);
	});

	it('the credit lowers a shortage and is not paid as extra on top of it', () => {
		// 07:30–12:10 + 13:25–18:55 = 610 worked: 110 short, the credit covers 60 of it.
		const s = summary('2026-11-06', [
			...twoSegments('2026-11-06', '18:55').slice(0, 2),
			...twoSegments('2026-11-06', '18:55').slice(2)
		]);
		expect(s).toMatchObject({
			workedMinutes: 610,
			creditMinutes: 60,
			shortageMinutes: 50,
			creditExtraMinutes: 0,
			short: true
		});
	});

	it('a credit that is left over is paid as extra time, never as overtime', () => {
		// 07:30–12:10 + 13:25–20:45 = 720 worked: no shortage, so the 60 is extra; no overtime.
		const s = summary('2026-11-06', twoSegments('2026-11-06', '20:45'));
		expect(s).toMatchObject({ workedMinutes: 720, creditMinutes: 60, creditExtraMinutes: 60 });
		expect(s.overtime?.minutes).toBe(0);
	});
});

describe('no credit', () => {
	it('a Friday with one segment', () => {
		const s = summary('2026-11-06', oneSegment('2026-11-06'));
		expect(s).toMatchObject({ segments: 1, creditMinutes: 0, shortageMinutes: 240 });
	});

	it('a Thursday with two segments', () => {
		const s = summary('2026-11-05', twoSegments('2026-11-05'));
		expect(s).toMatchObject({ segments: 2, creditMinutes: 0, creditExtraMinutes: 0 });
	});

	it('a Friday day off with two segments', () => {
		const s = summary('2026-11-06', twoSegments('2026-11-06'), SAME_DAY_OFF_ON_FRIDAY);
		expect(s).toMatchObject({ segments: 2, creditMinutes: 0, shortageMinutes: 0 });
	});

	it('a Friday with a full-day state', () => {
		const absent = roster('D D D D D', [
			{ startsOn: '2026-11-06', endsOn: '2026-11-06', type: 'leave' }
		]);
		expect(rosterDay(absent, '2026-11-06').source).toBe('absence');
		const s = summary('2026-11-06', twoSegments('2026-11-06'), absent);
		expect(s).toMatchObject({ creditMinutes: 0, shortageMinutes: 0, creditExtraMinutes: 0 });
	});

	it('when the setting is off', () => {
		const off = { ...ATTENDANCE_RULE_DEFAULTS, fridayPrayerOn: false };
		expect(summary('2026-11-06', twoSegments('2026-11-06'), WORK, off).creditMinutes).toBe(0);
		expect(
			fridayPrayerCredit({ shiftDate: '2026-11-06', workDay: true, segments: 2, rules: off })
		).toBe(0);
	});
});

describe('overtime rounding through the day', () => {
	it('is not rounded by default (Odoo)', () => {
		// Thursday 07:00–19:07: 727 worked, 7 past the 720 required.
		const punches = [ev('check_in', '2026-11-05T07:00'), ev('check_out', '2026-11-05T19:07')];
		expect(summary('2026-11-05', punches).overtime?.minutes).toBe(7);
	});

	it('follows a step of 15 when the day has one', () => {
		const punches = [ev('check_in', '2026-11-05T07:00'), ev('check_out', '2026-11-05T19:07')];
		const step15: AttendanceRules = { ...ATTENDANCE_RULE_DEFAULTS, overtimeStep: 15 };
		expect(summary('2026-11-05', punches, WORK, step15).overtime?.minutes).toBe(0);
	});
});

describe('fridayPrayerCredit', () => {
	it('needs the exact number of segments', () => {
		const rules = ATTENDANCE_RULE_DEFAULTS;
		expect(fridayPrayerCredit({ shiftDate: '2026-11-06', workDay: true, segments: 2, rules })).toBe(
			60
		);
		expect(fridayPrayerCredit({ shiftDate: '2026-11-06', workDay: true, segments: 3, rules })).toBe(
			0
		);
	});
});

describe('attendanceRulesOn', () => {
	const october: AttendanceRuleVersion = {
		...ATTENDANCE_RULE_DEFAULTS,
		id: 'v-oct',
		overtimeStep: 15,
		effectiveFrom: '2026-10-01',
		effectiveTo: '2026-11-01'
	};
	const november: AttendanceRuleVersion = {
		...ATTENDANCE_RULE_DEFAULTS,
		id: 'v-nov',
		overtimeStep: 5,
		effectiveFrom: '2026-11-01',
		effectiveTo: null
	};

	it('gives the version in force on the date: 31 Oct the first, 1 Nov the second', () => {
		expect(attendanceRulesOn([october, november], '2026-10-31')).toMatchObject({
			versionId: 'v-oct',
			source: 'company',
			rules: { overtimeStep: 15 }
		});
		expect(attendanceRulesOn([october, november], '2026-11-01')).toMatchObject({
			versionId: 'v-nov',
			rules: { overtimeStep: 5 }
		});
	});

	it('uses the built-in defaults before any version', () => {
		expect(attendanceRulesOn([october, november], '2026-09-30')).toEqual({
			rules: ATTENDANCE_RULE_DEFAULTS,
			versionId: null,
			source: 'default'
		});
	});
});
