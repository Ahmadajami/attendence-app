import { describe, expect, it } from 'vitest';
import { datesFrom, weekStartOf, zonedInstant } from './dates.js';
import { floatingOffCount, pickOffDays } from './off-days.js';
import { nightMinutes, pairSegments, type HoursEvent } from './segments.js';
import { at, TZ, work } from './test-helpers.js';

const NIGHT = { start: '22:00', end: '06:00', timeZone: TZ };

describe('dates', () => {
	it('reads wall-clock times in the timezone', () => {
		expect(zonedInstant('2026-11-02', '08:00', TZ).toISOString()).toBe('2026-11-02T05:00:00.000Z');
	});

	it('finds the start of a week', () => {
		expect(weekStartOf('2026-11-05', 0)).toBe('2026-11-01');
		expect(weekStartOf('2026-11-05', 6)).toBe('2026-10-31');
		expect(datesFrom('2026-11-30', '2026-12-02')).toEqual([
			'2026-11-30',
			'2026-12-01',
			'2026-12-02'
		]);
	});
});

describe('pairSegments (WH9)', () => {
	it('pairs a check-in with the next check-out, across midnight, on the check-in date', () => {
		const { segments, problems } = pairSegments(work('2026-11-02', '20:00', '04:00'));
		expect(problems).toEqual([]);
		expect(segments).toHaveLength(1);
		expect(segments[0]).toMatchObject({ date: '2026-11-02', minutes: 480 });
	});

	it('counts breaks as paid', () => {
		const [checkIn, checkOut] = work('2026-11-02', '08:00', '16:00');
		const breaks: HoursEvent[] = [
			{ ...checkIn, id: 'b1', type: 'break_start', occurredAt: at('2026-11-02', '12:00') },
			{ ...checkIn, id: 'b2', type: 'break_end', occurredAt: at('2026-11-02', '12:30') }
		];
		expect(pairSegments([checkIn, ...breaks, checkOut]).segments[0].minutes).toBe(480);
	});

	it('reports an open check-in, a lone check-out and a segment over 16 h, counting none', () => {
		const [openIn] = work('2026-11-02', '08:00', '16:00');
		const [, loneOut] = work('2026-11-03', '08:00', '16:00');
		const long = work('2026-11-04', '06:00', '23:00');
		const { segments, problems } = pairSegments([openIn, loneOut, ...long]);
		expect(segments).toEqual([]);
		expect(problems.map((p) => [p.date, p.kind])).toEqual([
			['2026-11-02', 'missing_check_out'],
			['2026-11-03', 'missing_check_in'],
			['2026-11-04', 'too_long']
		]);
	});

	it('applies a correction and a void', () => {
		const [checkIn, checkOut] = work('2026-11-02', '08:00', '16:00');
		const fixed: HoursEvent = {
			...checkOut,
			id: 'fix',
			occurredAt: at('2026-11-02', '17:00'),
			correctsEventId: checkOut.id
		};
		expect(pairSegments([checkIn, checkOut, fixed]).segments[0].minutes).toBe(540);
		const voided: HoursEvent = {
			...checkIn,
			id: 'void',
			isVoid: true,
			correctsEventId: checkIn.id
		};
		const { segments, problems } = pairSegments([checkIn, checkOut, voided]);
		expect(segments).toEqual([]);
		expect(problems[0].kind).toBe('missing_check_in');
	});
});

describe('nightMinutes', () => {
	it('counts the minutes inside a window that crosses midnight', () => {
		const night = (date: string, start: string, endDate: string, end: string) =>
			nightMinutes(at(date, start), at(endDate, end), date, NIGHT);
		expect(night('2026-11-02', '20:00', '2026-11-03', '04:00')).toBe(360);
		expect(night('2026-11-02', '05:00', '2026-11-02', '23:00')).toBe(120);
		expect(night('2026-11-02', '08:00', '2026-11-02', '16:00')).toBe(0);
	});

	it('counts nothing when the window is empty, and handles a same-day window', () => {
		const from = at('2026-11-02', '20:00');
		const to = at('2026-11-03', '04:00');
		expect(nightMinutes(from, to, '2026-11-02', { ...NIGHT, end: '22:00' })).toBe(0);
		const early = { ...NIGHT, start: '00:00', end: '05:00' };
		expect(nightMinutes(from, to, '2026-11-02', early)).toBe(240);
	});
});

describe('pickOffDays (WH2, WH5, Q-WH1)', () => {
	const day = (
		date: string,
		workedMinutes = 0,
		hasAbsence = false,
		fixedOff: boolean | null = null
	) => ({ date, fixedOff, workedMinutes, hasAbsence });

	it('takes the least-worked days, a day without an absence first, then the earlier date', () => {
		const days = [
			day('2026-11-01', 480),
			day('2026-11-02', 0, true),
			day('2026-11-03', 480),
			day('2026-11-04', 0),
			day('2026-11-05', 0),
			day('2026-11-06', 480),
			day('2026-11-07', 480)
		];
		const { off } = pickOffDays(days, 0, () => 2);
		expect([...off.keys()].sort()).toEqual(['2026-11-04', '2026-11-05']);
		const noAbsence = days.map((d) => (d.date === '2026-11-02' ? { ...d, hasAbsence: false } : d));
		expect([...pickOffDays(noAbsence, 0, () => 2).off.keys()].sort()).toEqual([
			'2026-11-02',
			'2026-11-04'
		]);
	});

	it('gives a partial week its share of off days', () => {
		expect([1, 2, 3, 4, 5, 6, 7].map((n) => floatingOffCount(2, n))).toEqual([0, 1, 1, 1, 1, 2, 2]);
	});

	it('keeps fixed off days and floats the rest by share', () => {
		const days = datesFrom('2026-11-01', '2026-11-07').map((d) =>
			day(d, 480, false, d === '2026-11-06' || d === '2026-11-07')
		);
		const { off, weeks } = pickOffDays(days, 0, () => 2);
		expect([...off.entries()]).toEqual([
			['2026-11-06', 'fixed'],
			['2026-11-07', 'fixed']
		]);
		expect(weeks[0].floatingOffDays).toBe(0);
	});
});
