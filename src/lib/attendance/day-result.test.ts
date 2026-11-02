import { describe, expect, it } from 'vitest';
import { resolvePayRule } from '#lib/payroll/pay-rule.js';
import type { AttendanceEntry } from '#lib/roster/attendance.js';
import { startOfDamascusDay } from '#lib/roster/cycle.js';
import {
	rosterDay,
	type RosterAssignment,
	type RosterHoliday,
	type RosterInput,
	type RosterOverrideEntry
} from '#lib/roster/roster.js';
import { SHIFTS, slots } from '#lib/roster/test-shifts.js';
import type { AbsenceType, PunchSource } from '#lib/schemas/enums.js';
import { dayResultHash, dayResultOf, diffDayResult, type DayResultInput } from './day-result.js';

// Made-up person on a made-up weekly pattern, Sunday first: off, D Monday–Friday, off Saturday.
// 1 Nov 2026 is a Sunday, so 2–6 Nov are work days and 7–8 Nov are off.

const PATTERN = 'p-week';
const assignment = (
	codes: string,
	owner: { teamId?: string } = { teamId: 'team-a' },
	patternId = PATTERN
): RosterAssignment => ({
	id: `a-${patternId}`,
	patternId,
	teamId: owner.teamId ?? null,
	departmentId: null,
	type: 'weekly',
	slots: slots(codes),
	defaultWorkShiftId: null,
	anchorDate: null,
	effectiveFrom: '2026-01-01',
	effectiveTo: null
});

const base: RosterInput = {
	memberships: [{ teamId: 'team-a', validFrom: startOfDamascusDay('2026-01-01'), validTo: null }],
	personalAssignments: [],
	teamAssignments: [assignment('O D D D D D O')],
	departmentAssignments: [],
	departmentChain: [],
	schedules: [],
	overrides: [],
	absences: [],
	holidays: [],
	shifts: SHIFTS
};

const holiday = (
	startsOn: string,
	otEligible: boolean,
	endsOn = startsOn,
	patternId = PATTERN
): RosterHoliday => ({ id: `h-${startsOn}`, patternId, startsOn, endsOn, otEligible });

const override = (
	shiftDate: string,
	shiftId: string | null,
	swapGroupId: string | null = null
): RosterOverrideEntry => ({ shiftDate, shiftId, swapGroupId });

const absence = (date: string, type: AbsenceType) => ({ startsOn: date, endsOn: date, type });

/** Damascus wall-clock time as an instant (UTC+3). */
const at = (local: string) => new Date(`${local}:00+03:00`);

let nextId = 0;
const ev = (
	type: 'check_in' | 'check_out',
	local: string,
	source: PunchSource = 'manual',
	correctsEventId: string | null = null
): AttendanceEntry => ({
	id: `e${++nextId}`,
	type,
	occurredAt: at(local),
	shiftId: 'D',
	correctsEventId,
	isVoid: false,
	source
});

/** A worked pair on `date` from `from` to `to` (HH:MM). */
const pair = (date: string, from: string, to: string, source: PunchSource = 'manual') => [
	ev('check_in', `${date}T${from}`, source),
	ev('check_out', `${date}T${to}`, source)
];

const NOW = at('2026-11-20T12:00');

const result = (
	input: RosterInput,
	date: string,
	events: AttendanceEntry[] = [],
	extra: Partial<DayResultInput> = {}
) =>
	dayResultOf({
		staffId: 's-1',
		day: rosterDay(input, date),
		events,
		pay: resolvePayRule([], date),
		swap: null,
		now: NOW,
		...extra
	});

describe('a normal work day', () => {
	it('pays 60 minutes past the 720 required at ×1.25 (guide example A)', () => {
		const r = result(base, '2026-11-03', pair('2026-11-03', '07:00', '20:00'));
		expect(r).toMatchObject({
			kind: 'work',
			status: 'done',
			requiredMinutes: 720,
			workedMinutes: 780,
			overtimeMinutes: 60,
			otRate: 1.25,
			paidOtMinutes: 60,
			unpaidExtraMinutes: 0,
			unpaidReason: null,
			patternId: PATTERN,
			unauthSwap: false
		});
	});
});

describe('holidays (PR2, PR3, PR8)', () => {
	const withHoliday = (h: RosterHoliday, more: Partial<RosterInput> = {}): RosterInput => ({
		...base,
		holidays: [h],
		...more
	});

	it('T5: eligible holiday with a one-off shift → every minute at the holiday rate', () => {
		const input = withHoliday(holiday('2026-11-03', true), {
			overrides: [override('2026-11-03', 'D')]
		});
		const r = result(input, '2026-11-03', pair('2026-11-03', '07:00', '17:00'));
		expect(r).toMatchObject({
			kind: 'holiday_work',
			holidayId: 'h-2026-11-03',
			requiredMinutes: 0,
			workedMinutes: 600,
			overtimeMinutes: 600,
			otRate: 1.5,
			paidOtMinutes: 600
		});
	});

	it('T6: holiday not eligible → nothing paid, 600 unpaid', () => {
		const input = withHoliday(holiday('2026-11-03', false), {
			overrides: [override('2026-11-03', 'D')]
		});
		const r = result(input, '2026-11-03', pair('2026-11-03', '07:00', '17:00'));
		expect(r).toMatchObject({
			kind: 'holiday_work',
			otRate: null,
			paidOtMinutes: 0,
			unpaidExtraMinutes: 600,
			unpaidReason: 'holiday_not_eligible'
		});
	});

	it('T7: holiday not worked → a paid day off, not absent', () => {
		const input = withHoliday(holiday('2026-11-03', true));
		const day = rosterDay(input, '2026-11-03');
		expect(day).toMatchObject({ shiftId: null, plannedShiftId: 'D', source: 'team' });
		expect(result(input, '2026-11-03')).toMatchObject({
			kind: 'holiday_off',
			status: 'off',
			requiredMinutes: 0,
			paidOtMinutes: 0
		});
	});

	it('T8: holiday on a pattern off day → stays off, holiday kept', () => {
		const r = result(withHoliday(holiday('2026-11-08', true)), '2026-11-08');
		expect(r).toMatchObject({ kind: 'holiday_off', shiftId: null, holidayId: 'h-2026-11-08' });
	});

	it('T9: a mission on a holiday → the absence wins', () => {
		const input = withHoliday(holiday('2026-11-03', true), {
			absences: [absence('2026-11-03', 'mission')]
		});
		expect(result(input, '2026-11-03')).toMatchObject({
			kind: 'absence',
			absenceType: 'mission',
			status: 'absent',
			holidayId: 'h-2026-11-03'
		});
	});

	it('T10: a night shift on the eve of a holiday belongs to the eve', () => {
		const nights: RosterInput = {
			...base,
			teamAssignments: [assignment('N N N N N N N')],
			holidays: [holiday('2026-11-06', true)]
		};
		expect(rosterDay(nights, '2026-11-05')).toMatchObject({ shiftId: 'N', holiday: null });
		expect(rosterDay(nights, '2026-11-06')).toMatchObject({ shiftId: null });
		expect(rosterDay(nights, '2026-11-06').holiday?.id).toBe('h-2026-11-06');
	});

	it("T11: a personal pattern plans the day → the team pattern's holiday does not apply", () => {
		const input: RosterInput = {
			...base,
			personalAssignments: [assignment('D D D D D D D', {}, 'p-personal')],
			holidays: [holiday('2026-11-03', true)]
		};
		expect(rosterDay(input, '2026-11-03')).toMatchObject({
			shiftId: 'D',
			source: 'personal',
			holiday: null
		});
	});

	it('T12: only holidays of the planning pattern, on their dates, apply (cancelled ones are not loaded)', () => {
		const input = withHoliday(holiday('2026-11-03', true, '2026-11-04', 'p-other'));
		expect(rosterDay(input, '2026-11-03').holiday).toBeNull();
		const range = withHoliday(holiday('2026-11-03', true, '2026-11-04'));
		expect(rosterDay(range, '2026-11-02').holiday).toBeNull();
		expect(rosterDay(range, '2026-11-04').holiday).not.toBeNull();
		expect(rosterDay(range, '2026-11-05').holiday).toBeNull();
	});
});

describe('day edits and the edit log (PR19, PR22–PR24)', () => {
	it('T13: punches on a day HR set to leave count for nothing', () => {
		const input = { ...base, absences: [absence('2026-11-03', 'leave')] };
		const r = result(input, '2026-11-03', pair('2026-11-03', '07:00', '17:00'));
		expect(r).toMatchObject({
			kind: 'absence',
			status: 'absent',
			absenceType: 'leave',
			requiredMinutes: 0,
			workedMinutes: 600,
			paidOtMinutes: 0,
			unpaidExtraMinutes: 600,
			unpaidReason: 'absence'
		});
	});

	it('T14: the same inputs give the same hash and no log lines', () => {
		const events = pair('2026-11-03', '07:00', '19:00');
		const first = result(base, '2026-11-03', events);
		const again = result(base, '2026-11-03', events);
		expect(dayResultHash(again)).toBe(dayResultHash(first));
		expect(diffDayResult(first, again)).toEqual([]);
		expect(dayResultHash(result(base, '2026-11-04', events))).not.toBe(dayResultHash(first));
	});

	it('writes one "created" line for a day computed the first time', () => {
		expect(diffDayResult(null, result(base, '2026-11-03'))).toEqual([
			{ field: 'created', oldValue: null, newValue: 'work' }
		]);
	});

	it('T15: a corrected check-out 18:00 → 19:15 changes check-out, worked and overtime', () => {
		const checkIn = ev('check_in', '2026-11-03T07:00');
		const checkOut = ev('check_out', '2026-11-03T18:00');
		const before = result(base, '2026-11-03', [checkIn, checkOut]);
		const fix = ev('check_out', '2026-11-03T19:15', 'manual', checkOut.id);
		const after = result(base, '2026-11-03', [checkIn, checkOut, fix]);

		const fields = diffDayResult(before, after).map((c) => c.field);
		expect(fields).toEqual(['check_out', 'worked', 'overtime', 'ot_rate', 'paid_ot']);
		expect(diffDayResult(before, after)).toContainEqual({
			field: 'worked',
			oldValue: 660,
			newValue: 735
		});
		expect(after.corrected).toBe(true);
		expect(before.corrected).toBe(false);
	});

	it('T16: a punch reading, then a typed correction of the check-in', () => {
		const [checkIn, checkOut] = pair('2026-11-03', '07:05', '19:00', 'import');
		const read = result(base, '2026-11-03', [checkIn, checkOut]);
		expect(read).toMatchObject({
			checkInSource: 'import',
			checkOutSource: 'import',
			corrected: false
		});
		const fix = ev('check_in', '2026-11-03T06:58', 'manual', checkIn.id);
		const fixed = result(base, '2026-11-03', [checkIn, checkOut, fix]);
		expect(fixed).toMatchObject({
			checkInSource: 'manual',
			checkOutSource: 'import',
			corrected: true
		});
	});
});

describe('swaps and off-day work (PR28)', () => {
	// Self swap sw1: Tuesday's D moves to Saturday.
	const swapped: RosterInput = {
		...base,
		overrides: [override('2026-11-03', null, 'sw1'), override('2026-11-07', 'D', 'sw1')]
	};

	it('marks the moved days swap_off / swap_on with the swap id', () => {
		expect(
			result(swapped, '2026-11-03', [], { swap: { id: 'sw1', payAsOt: false } })
		).toMatchObject({ kind: 'off', swapRole: 'swap_off', swapRequestId: 'sw1' });
		const sat = result(swapped, '2026-11-07', pair('2026-11-07', '07:00', '17:00'), {
			swap: { id: 'sw1', payAsOt: false }
		});
		// Without "pay as overtime" the moved day is a normal work day: 600 < 720 required.
		expect(sat).toMatchObject({
			kind: 'work',
			swapRole: 'swap_on',
			requiredMinutes: 720,
			overtimeMinutes: 0
		});
	});

	it('T21: "pay as overtime" → every minute of the moved day at the off-day rate', () => {
		const sat = result(swapped, '2026-11-07', pair('2026-11-07', '07:00', '17:00'), {
			swap: { id: 'sw1', payAsOt: true }
		});
		expect(sat).toMatchObject({
			kind: 'off_work',
			requiredMinutes: 0,
			overtimeMinutes: 600,
			otRate: 1.5,
			paidOtMinutes: 600,
			unauthSwap: false
		});
	});

	it('T22: working an own off day with no swap → unauthorised swap, paid as off-day work', () => {
		const sun = result(base, '2026-11-08', pair('2026-11-08', '07:00', '17:00'));
		expect(sun).toMatchObject({
			kind: 'off_work',
			unauthSwap: true,
			otRate: 1.5,
			paidOtMinutes: 600
		});
		// A one-off shift HR planned is not a swap and not unauthorised.
		const planned = { ...base, overrides: [override('2026-11-08', 'D')] };
		expect(result(planned, '2026-11-08', pair('2026-11-08', '07:00', '17:00'))).toMatchObject({
			kind: 'off_work',
			unauthSwap: false
		});
	});

	it('pays nothing extra with overtime off on the pattern (PR15)', () => {
		const pay = resolvePayRule(
			[
				{
					otEnabled: false,
					workDayRate: null,
					offDayRate: null,
					holidayRate: null,
					effectiveFrom: '2026-01-01',
					effectiveTo: null
				}
			],
			'2026-11-08'
		);
		const sun = result(base, '2026-11-08', pair('2026-11-08', '07:00', '17:00'), { pay });
		expect(sun).toMatchObject({
			paidOtMinutes: 0,
			unpaidExtraMinutes: 600,
			unpaidReason: 'ot_off'
		});
	});
});
