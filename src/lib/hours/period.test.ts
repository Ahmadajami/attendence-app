import { describe, expect, it } from 'vitest';
import { datesFrom } from './dates.js';
import { hoursPeriod, type HoursAbsence, type HoursPeriodInput } from './period.js';
import type { StaffHoursVersion } from './rules.js';
import { rule, TZ, work, workEach } from './test-helpers.js';

// Made-up person and punches (CLAUDE.md §1). 2026-11-01 is a Sunday; 40 h a week, 2 off days,
// weeks from Sunday, night 22:00–06:00, rates 1.25 / 1.5 / 1.5.

const SUN_THU = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
const SUN_WED = SUN_THU.slice(0, 4);

function run(over: Partial<HoursPeriodInput>) {
	const result = hoursPeriod({
		staffId: 'person-1',
		from: '2026-11-01',
		to: '2026-11-07',
		timeZone: TZ,
		rules: [rule()],
		events: [],
		absences: [],
		...over
	});
	if (result.status !== 'ok') throw new Error(`no rules on ${result.missingOn}`);
	return result;
}

const fixedFriSat: StaffHoursVersion = {
	id: 'person-version-1',
	effectiveFrom: '2026-01-01',
	effectiveTo: null,
	weeklyMinutes: null,
	fixedOffDays: [5, 6]
};

const absence = (date: string, type: HoursAbsence['type']): HoursAbsence => ({
	startsOn: date,
	endsOn: date,
	type
});

describe('hoursPeriod', () => {
	it('1. five 8 h days: no overtime, no shortage, Friday and Saturday float off', () => {
		const r = run({ events: workEach(SUN_THU, '08:00', '16:00') });
		expect(r).toMatchObject({ requiredMinutes: 2400, owedMinutes: 2400, workedMinutes: 2400 });
		expect(r.shortageMinutes).toBe(0);
		expect(r.overtime).toEqual({ day: 0, night: 0, offDay: 0, offDayNight: 0 });
		expect(r.weeks[0].offDates).toEqual(['2026-11-06', '2026-11-07']);
	});

	it('2. six 9 h days, floating: the least-worked day is an off day', () => {
		const r = run({ events: workEach(datesFrom('2026-11-01', '2026-11-06'), '08:00', '17:00') });
		// Saturday (0) and the earliest 9 h day are off: 9 h off-day OT; 45 h − 40 h = 5 h day OT.
		expect(r.weeks[0].offDates).toEqual(['2026-11-01', '2026-11-07']);
		expect(r.overtime).toEqual({ day: 300, night: 0, offDay: 540, offDayNight: 0 });
		expect(r.weighted.total).toBe(300 * 1.25 + 540 * 1.5);
	});

	it('3. fixed Friday + Saturday: Saturday work is off-day OT even in a short week', () => {
		const r = run({
			person: [fixedFriSat],
			events: [...workEach(SUN_WED, '08:00', '16:00'), ...work('2026-11-07', '09:00', '15:00')]
		});
		expect(r.days.filter((d) => d.off).map((d) => [d.date, d.off])).toEqual([
			['2026-11-06', 'fixed'],
			['2026-11-07', 'fixed']
		]);
		expect(r.overtime.offDay).toBe(360);
		expect(r.overtime.day).toBe(0);
		// Q-WH2: the 8 h shortage does not eat the off-day overtime.
		expect(r.shortageMinutes).toBe(480);
	});

	it('4. over the whole period a short week cancels overtime from another (WH3)', () => {
		const r = run({
			to: '2026-11-14',
			events: [
				...workEach(SUN_WED, '08:00', '16:00'),
				...work('2026-11-05', '08:00', '12:00'),
				...workEach(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], '08:00', '16:00'),
				...work('2026-11-12', '06:00', '20:00')
			]
		});
		expect(r.owedMinutes).toBe(4800);
		expect(r.overtime.day).toBe(120);
		expect(r.shortageMinutes).toBe(0);
		expect(r.days.find((d) => d.date === '2026-11-12')?.overtime.day).toBe(120);
	});

	it('5. the overtime minutes are the last ones worked, day or night by the clock (WH4)', () => {
		const r = run({
			events: [...workEach(SUN_WED, '08:00', '16:00'), ...work('2026-11-05', '12:00', '23:00')]
		});
		// 43 h: the last 3 h are 20:00–23:00, so 2 h day and 1 h night.
		expect(r.overtime).toMatchObject({ day: 120, night: 60 });
		expect(r.weighted.total).toBe(120 * 1.25 + 60 * 1.5);
	});

	it('6. a segment crossing midnight counts on its check-in date', () => {
		const r = run({ events: work('2026-11-02', '20:00', '04:00') });
		const day = r.days.find((d) => d.date === '2026-11-02');
		expect(day).toMatchObject({ workedMinutes: 480, nightMinutes: 360 });
		expect(r.shortageMinutes).toBe(1920);
	});

	it('7. night on an off day: off-day rate, or its own rate when switched on (WH6)', () => {
		const events = [
			...workEach(SUN_THU, '08:00', '16:00'),
			...work('2026-11-07', '18:00', '02:00')
		];
		const plain = run({ events, person: [fixedFriSat] });
		expect(plain.overtime).toEqual({ day: 0, night: 0, offDay: 480, offDayNight: 0 });
		expect(plain.weighted.total).toBe(720);
		const own = run({
			events,
			person: [fixedFriSat],
			rules: [rule({ offDayNightOn: true, offDayNightRate: 2 })]
		});
		expect(own.overtime).toEqual({ day: 0, night: 0, offDay: 240, offDayNight: 240 });
		expect(own.weighted.total).toBe(240 * 1.5 + 240 * 2);
	});

	it('7b. an overtime kind switched off is shown but weighted 0 (WH6)', () => {
		const r = run({
			rules: [rule({ dayOtOn: false })],
			events: workEach(datesFrom('2026-11-01', '2026-11-06'), '08:00', '17:00')
		});
		expect(r.overtime.day).toBe(300);
		expect(r.weighted.day).toBe(0);
		expect(r.notPaidMinutes).toBe(300);
		expect(r.weighted.total).toBe(540 * 1.5);
	});

	it('8. absences by type: paid credit, unpaid excused, no-show owed (WH13)', () => {
		const events = workEach(SUN_WED, '08:00', '16:00');
		const paid = run({ events, absences: [absence('2026-11-05', 'leave')] });
		expect(paid).toMatchObject({ creditMinutes: 480, owedMinutes: 1920, shortageMinutes: 0 });
		expect(paid.paidAbsenceDays).toBe(1);
		const unpaid = run({ events, absences: [absence('2026-11-05', 'other')] });
		expect(unpaid).toMatchObject({ excusedMinutes: 480, owedMinutes: 1920, unpaidDays: 1 });
		const noShow = run({ events, absences: [absence('2026-11-05', 'no_show')] });
		// Friday and Saturday (no absence) float off before the no-show day (Q-WH1).
		expect(noShow.weeks[0].offDates).toEqual(['2026-11-06', '2026-11-07']);
		expect(noShow).toMatchObject({ owedMinutes: 2400, shortageMinutes: 480, notExcusedDays: 1 });
	});

	it('8b. leave on an off day changes nothing; punches on an absence day are ignored', () => {
		const r = run({
			person: [fixedFriSat],
			events: [...workEach(SUN_THU, '08:00', '16:00'), ...work('2026-11-06', '08:00', '12:00')],
			absences: [absence('2026-11-06', 'leave')]
		});
		expect(r).toMatchObject({ creditMinutes: 0, owedMinutes: 2400, ignoredSegments: 1 });
		expect(r.overtime.offDay).toBe(0);
	});

	it('8c. HR can change how a type counts', () => {
		const treatment = { ...rule().absenceTreatment, sick: 'not_excused' as const };
		const r = run({
			rules: [rule({ absenceTreatment: treatment })],
			events: workEach(SUN_WED, '08:00', '16:00'),
			absences: [absence('2026-11-05', 'sick')]
		});
		expect(r).toMatchObject({ creditMinutes: 0, shortageMinutes: 480, notExcusedDays: 1 });
	});

	it('9. a partial week at the edge gets its share of off days and of the required time', () => {
		const r = run({ to: '2026-11-17' });
		expect(r.weeks.map((w) => [w.start, w.end, w.floatingOffDays])).toEqual([
			['2026-11-01', '2026-11-07', 2],
			['2026-11-08', '2026-11-14', 2],
			['2026-11-15', '2026-11-17', 1]
		]);
		expect(r.requiredMinutes).toBe(Math.round((2400 * 17) / 7));
	});

	it('10. a person version changes the weekly hours', () => {
		const r = run({
			person: [{ ...fixedFriSat, weeklyMinutes: 55 * 60, fixedOffDays: null }],
			events: workEach(SUN_THU, '08:00', '19:00'),
			absences: []
		});
		expect(r.owedMinutes).toBe(3300);
		expect(r.overtime.day).toBe(0);
	});

	it('11. a problem day is listed and counts nothing', () => {
		const [openIn] = work('2026-11-05', '08:00', '16:00');
		const r = run({ events: [...workEach(SUN_WED, '08:00', '16:00'), openIn] });
		expect(r.problems).toEqual([
			{ date: '2026-11-05', kind: 'missing_check_out', eventId: openIn.id }
		]);
		expect(r.shortageMinutes).toBe(480);
	});

	it('12. each day takes the company version in force on its date', () => {
		const r = run({
			to: '2026-11-14',
			rules: [
				rule({ id: 'v1', effectiveTo: '2026-11-08' }),
				rule({ id: 'v2', effectiveFrom: '2026-11-08', dayOtRate: 2 })
			],
			events: [
				...workEach(SUN_THU, '08:00', '16:00'),
				...workEach(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], '08:00', '16:00'),
				...work('2026-11-12', '08:00', '18:00')
			]
		});
		expect(r.overtime.day).toBe(120);
		expect(r.weighted.day).toBe(240);
		expect(r.ruleVersionIds).toEqual(['v1', 'v2']);
	});

	it('13. without a company version the period has minutes only (WH8)', () => {
		const result = hoursPeriod({
			staffId: 'person-1',
			from: '2025-12-30',
			to: '2026-01-02',
			timeZone: TZ,
			rules: [rule()],
			events: work('2026-01-01', '08:00', '16:00'),
			absences: []
		});
		expect(result).toMatchObject({
			status: 'no_rules',
			missingOn: '2025-12-30',
			workedMinutes: 480
		});
	});
});
