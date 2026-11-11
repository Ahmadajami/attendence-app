import { describe, expect, it } from 'vitest';
import type { AttendanceEventType } from '#lib/schemas/enums.js';
import { D, E, N } from '#lib/roster/test-shifts.js';
import {
	calendarDate,
	normalizeClock,
	pairMinutes,
	pairsOf,
	punchDays,
	resolvePair,
	toPairs,
	validatePair,
	workedMinutes,
	type Pair,
	type PairContext
} from './entry.js';

/** Damascus wall-clock time as an instant (UTC+3). */
const at = (local: string) => new Date(`${local}:00+03:00`);
const iso = (d: Date | null) => d?.toISOString() ?? null;

const LATER = at('2026-12-01T00:00');
const ctx = (patch: Partial<PairContext> = {}): PairContext => ({
	shiftDate: '2026-11-03',
	shift: N,
	others: [],
	now: LATER,
	...patch
});

describe('normalizeClock', () => {
	it('turns shorthand into HH:mm', () => {
		expect(['7', '730', '1900', '19.30', '19:30', '0', '٠٧٣٠', ''].map(normalizeClock)).toEqual([
			'07:00',
			'07:30',
			'19:00',
			'19:30',
			'19:30',
			'00:00',
			'07:30',
			''
		]);
	});

	it('leaves what it cannot read unchanged', () => {
		expect(['2400', '19:60', 'ab', '19:3'].map(normalizeClock)).toEqual([
			'2400',
			'19:60',
			'ab',
			'19:3'
		]);
	});
});

describe('resolvePair', () => {
	it('puts a 07:00 check-out after a 19:00 night check-in on the next day: 720 min', () => {
		const pair = resolvePair('2026-11-03', N, '19:00', '07:00');
		expect(iso(pair.checkIn)).toBe(iso(at('2026-11-03T19:00')));
		expect(iso(pair.checkOut)).toBe(iso(at('2026-11-04T07:00')));
		expect(pairMinutes(pair)).toBe(720);
	});

	it('keeps a day shift on its date', () => {
		const pair = resolvePair('2026-11-02', D, '07:00', '19:00');
		expect(iso(pair.checkIn)).toBe(iso(at('2026-11-02T07:00')));
		expect(iso(pair.checkOut)).toBe(iso(at('2026-11-02T19:00')));
	});

	it('ends 16:00 → 03:30 on the 16→04 shift the next day', () => {
		const pair = resolvePair('2026-11-05', E, '16:00', '03:30');
		expect(iso(pair.checkOut)).toBe(iso(at('2026-11-06T03:30')));
		expect(pairMinutes(pair)).toBe(690);
	});

	it('keeps 19:00 → 19:30 on the same day: 30 min', () => {
		const pair = resolvePair('2026-11-03', N, '19:00', '19:30');
		expect(iso(pair.checkOut)).toBe(iso(at('2026-11-03T19:30')));
		expect(pairMinutes(pair)).toBe(30);
	});

	it('puts a 02:00 check-in typed for a night on the next calendar day', () => {
		const pair = resolvePair('2026-11-03', N, '02:00', '07:00');
		expect(calendarDate(pair.checkIn)).toBe('2026-11-04');
		expect(iso(pair.checkOut)).toBe(iso(at('2026-11-04T07:00')));
	});

	it('keeps an early arrival inside the window on the shift date', () => {
		expect(calendarDate(resolvePair('2026-11-03', N, '16:00', null).checkIn)).toBe('2026-11-03');
	});

	it('keeps a missing check-out missing', () => {
		const pair = resolvePair('2026-11-03', N, '19:00', null);
		expect(pair.checkOut).toBeNull();
		expect(pairMinutes(pair)).toBeNull();
	});
});

describe('validatePair', () => {
	it('accepts a normal night', () => {
		expect(validatePair(resolvePair('2026-11-03', N, '19:00', '07:00'), ctx())).toEqual({
			errors: [],
			warnings: []
		});
	});

	it('refuses more than 16 h', () => {
		const pair = resolvePair('2026-11-02', D, '07:00', '00:00'); // 17 h
		expect(validatePair(pair, ctx({ shiftDate: '2026-11-02', shift: D })).errors).toContain(
			'span_too_long'
		);
		const sixteen = resolvePair('2026-11-02', D, '07:00', '23:00');
		expect(validatePair(sixteen, ctx({ shiftDate: '2026-11-02', shift: D })).errors).toEqual([]);
	});

	it('refuses an overlap with another pair, also an open one, on any shift date', () => {
		const night = resolvePair('2026-11-03', N, '19:00', '07:00');
		const earlier: Pair = { checkIn: at('2026-11-03T07:00'), checkOut: at('2026-11-03T19:30') };
		expect(validatePair(night, ctx({ others: [earlier] })).errors).toEqual(['overlap']);
		const open: Pair = { checkIn: at('2026-11-04T01:00'), checkOut: null };
		expect(validatePair(night, ctx({ others: [open] })).errors).toEqual(['overlap']);
		const touching: Pair = { checkIn: at('2026-11-03T07:00'), checkOut: at('2026-11-03T19:00') };
		expect(validatePair(night, ctx({ others: [touching] })).errors).toEqual([]);
	});

	it('refuses a time in the future', () => {
		const pair = resolvePair('2026-11-03', N, '19:00', '07:00');
		expect(validatePair(pair, ctx({ now: at('2026-11-04T06:00') })).errors).toEqual(['future']);
		expect(validatePair(pair, ctx({ now: at('2026-11-03T18:00') })).errors).toEqual(['future']);
	});

	it("warns outside the planned shift's window and on a day off", () => {
		const late = resolvePair('2026-11-03', N, '19:00', '14:00'); // 19 h is also too long
		expect(validatePair(late, ctx()).warnings).toEqual(['outside_window']);
		// A day off: no planned shift, so no window to check; never an error (plan PS4).
		const extra = resolvePair('2026-11-03', null, '19:00', '07:00');
		const offDay = validatePair(extra, ctx({ shift: null }));
		expect(offDay).toEqual({ errors: [], warnings: ['unplanned'] });
	});

	it('reads times on a day off as typed: the date, and a check-out before the check-in the next morning', () => {
		const night = resolvePair('2026-11-03', null, '20:00', '08:00');
		expect([iso(night.checkIn), iso(night.checkOut)]).toEqual([
			iso(at('2026-11-03T20:00')),
			iso(at('2026-11-04T08:00'))
		]);
		// Without a planned night, 02:00 is that date's 02:00 (not the next morning).
		expect(iso(resolvePair('2026-11-03', null, '02:00', null).checkIn)).toBe(
			iso(at('2026-11-03T02:00'))
		);
	});
});

let nextId = 0;
const ev = (type: AttendanceEventType, local: string, patch: object = {}) => ({
	id: `e${++nextId}`,
	type,
	occurredAt: at(local),
	correctsEventId: null as string | null,
	isVoid: false,
	...patch
});

describe('pairsOf', () => {
	it('pairs effective check-ins and check-outs, skipping breaks', () => {
		const inn = ev('check_in', '2026-11-03T19:00');
		const brk = ev('break_start', '2026-11-03T23:00');
		const out = ev('check_out', '2026-11-04T07:00');
		const pairs = pairsOf([out, brk, inn]);
		expect(pairs.map((p) => [p.checkIn?.id, p.checkOut?.id])).toEqual([[inn.id, out.id]]);
		expect(workedMinutes(toPairs(pairs))).toBe(720);
	});

	it('uses the correction, not the corrected event', () => {
		const inn = ev('check_in', '2026-11-03T19:00');
		const out = ev('check_out', '2026-11-04T07:00');
		const fix = ev('check_out', '2026-11-04T07:30', { correctsEventId: out.id });
		const pairs = pairsOf([inn, out, fix]);
		expect(pairs.map((p) => p.checkOut?.id)).toEqual([fix.id]);
		expect(workedMinutes(toPairs(pairs))).toBe(750);
	});

	it('keeps open and stray events visible', () => {
		const first = ev('check_in', '2026-11-03T07:00');
		const second = ev('check_in', '2026-11-03T19:00');
		const stray = ev('check_out', '2026-11-05T07:00');
		const pairs = pairsOf([first, second, stray]);
		expect(pairs.map((p) => [p.checkIn?.id ?? null, p.checkOut?.id ?? null])).toEqual([
			[first.id, null],
			[second.id, stray.id]
		]);
		expect(workedMinutes(toPairs([{ checkIn: first, checkOut: null }]))).toBeNull();
	});
});

describe('punchDays', () => {
	it('sums worked minutes per person and shift date, ignoring voided events', () => {
		const a = (
			type: AttendanceEventType,
			local: string,
			shiftDate: string,
			patch: object = {}
		) => ({
			...ev(type, local, patch),
			staffId: 'p1',
			shiftDate
		});
		const inn = a('check_in', '2026-11-03T19:00', '2026-11-03');
		const out = a('check_out', '2026-11-04T07:00', '2026-11-03');
		const open = a('check_in', '2026-11-05T07:00', '2026-11-05');
		const stray = a('check_in', '2026-11-06T07:00', '2026-11-06');
		const voided = a('check_in', '2026-11-06T07:00', '2026-11-06', {
			correctsEventId: stray.id,
			isVoid: true
		});
		expect(punchDays([inn, out, open, stray, voided])).toEqual({
			p1: { '2026-11-03': { worked: 720 }, '2026-11-05': { worked: null } }
		});
	});
});
