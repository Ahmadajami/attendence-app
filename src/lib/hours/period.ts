import type { AbsenceType } from '#lib/schemas/enums.js';
import { datesFrom, weekdayOf } from './dates.js';
import { pickOffDays, type OffSource, type Week } from './off-days.js';
import {
	absenceShare,
	versionOn,
	type AbsenceTreatment,
	type HoursRuleVersion,
	type StaffHoursVersion
} from './rules.js';
import {
	nightMinutes,
	pairSegments,
	type HoursEvent,
	type NightWindow,
	type Problem,
	type Segment
} from './segments.js';

// One person's hours and overtime over a period (plan 2026-11-16, WH2–WH13). Pure: the service
// loads the punches, absences and versions, and calls this once per person.

const MINUTE = 60_000;

/** A full-day absence (cancelled ones left out by the caller). */
export type HoursAbsence = { startsOn: string; endsOn: string; type: AbsenceType };

export type HoursPeriodInput = {
	staffId: string;
	/** Both included. The caller clips them to the person's employment. */
	from: string;
	to: string;
	timeZone: string;
	/** Company versions (`hours_rule`). */
	rules: readonly HoursRuleVersion[];
	/** The person's versions (`staff_hours`). */
	person?: readonly StaffHoursVersion[];
	/** The person's punches whose date is in the period. */
	events: readonly HoursEvent[];
	absences: readonly HoursAbsence[];
};

export const OT_KINDS = ['day', 'night', 'offDay', 'offDayNight'] as const;
export type OtKind = (typeof OT_KINDS)[number];
export type ByKind = Record<OtKind, number>;

export type HoursDay = {
	date: string;
	weekday: number;
	off: OffSource | null;
	absenceType: AbsenceType | null;
	treatment: AbsenceTreatment | null;
	/** Counted minutes (0 on an absence day: its punches are ignored). */
	workedMinutes: number;
	nightMinutes: number;
	overtime: ByKind;
};

export type HoursPeriod =
	| {
			status: 'ok';
			staffId: string;
			from: string;
			to: string;
			/** Weekly hours × days ÷ 7, before absences. */
			requiredMinutes: number;
			/** Absence days counted as paid time (WH13). */
			creditMinutes: number;
			/** Absence days excused without pay (WH13). */
			excusedMinutes: number;
			/** What work days must cover: required − credit − excused. */
			owedMinutes: number;
			workedMinutes: number;
			workDayMinutes: number;
			offDayMinutes: number;
			/** Owed time not covered by work-day time (WH3). */
			shortageMinutes: number;
			overtime: ByKind;
			/** Overtime of a kind switched off (WH6): shown, weighted 0. */
			notPaidMinutes: number;
			/** Minutes × rate, 2 decimals (WH11). */
			weighted: ByKind & { total: number };
			paidAbsenceDays: number;
			unpaidDays: number;
			notExcusedDays: number;
			/** Segments on absence days, not counted (WH10). */
			ignoredSegments: number;
			days: HoursDay[];
			weeks: Week[];
			problems: Problem[];
			ruleVersionIds: string[];
	  }
	| {
			/** A date of the period has no company version (WH8): minutes only. */
			status: 'no_rules';
			staffId: string;
			from: string;
			to: string;
			missingOn: string;
			workedMinutes: number;
			problems: Problem[];
	  };

const zero = (): ByKind => ({ day: 0, night: 0, offDay: 0, offDayNight: 0 });
const round2 = (n: number) => Math.round(n * 100) / 100;

function rateOf(kind: OtKind, rule: HoursRuleVersion): { on: boolean; rate: number } {
	switch (kind) {
		case 'day':
			return { on: rule.dayOtOn, rate: rule.dayOtRate };
		case 'night':
			return { on: rule.nightOtOn, rate: rule.nightOtRate };
		case 'offDay':
			return { on: rule.offDayOtOn, rate: rule.offDayOtRate };
		case 'offDayNight':
			return { on: rule.offDayOtOn, rate: rule.offDayNightRate ?? rule.offDayOtRate };
	}
}

/** The person's hours, off days, shortage and overtime from `from` to `to`. */
export function hoursPeriod(input: HoursPeriodInput): HoursPeriod {
	const { from, to } = input;
	const dates = datesFrom(from, to);
	const { segments: paired, problems } = pairSegments(input.events);
	const inPeriod = paired.filter((s) => s.date >= from && s.date <= to);
	const base = { staffId: input.staffId, from, to };

	const ruleOf = new Map<string, HoursRuleVersion>();
	for (const date of dates) {
		const rule = versionOn(input.rules, date);
		if (!rule) {
			const workedMinutes = inPeriod.reduce((sum, s) => sum + s.minutes, 0);
			return { ...base, status: 'no_rules', missingOn: date, workedMinutes, problems };
		}
		ruleOf.set(date, rule);
	}
	const rule = (date: string) => ruleOf.get(date) as HoursRuleVersion;
	const personOn = (date: string) => versionOn(input.person ?? [], date);
	const weeklyOn = (date: string) => personOn(date)?.weeklyMinutes ?? rule(date).weeklyMinutes;
	const absenceOn = (date: string) =>
		input.absences.find((a) => a.startsOn <= date && date <= a.endsOn) ?? null;
	const night = (date: string): NightWindow => ({
		start: rule(date).nightStart,
		end: rule(date).nightEnd,
		timeZone: input.timeZone
	});

	// Punches on an absence day count for nothing (WH10).
	const counted: Segment[] = [];
	let ignoredSegments = 0;
	for (const s of inPeriod) {
		if (absenceOn(s.date)) ignoredSegments++;
		else counted.push(s);
	}

	const days = new Map<string, HoursDay>();
	for (const date of dates) {
		const absence = absenceOn(date);
		days.set(date, {
			date,
			weekday: weekdayOf(date),
			off: null,
			absenceType: absence?.type ?? null,
			treatment: absence ? rule(date).absenceTreatment[absence.type] : null,
			workedMinutes: 0,
			nightMinutes: 0,
			overtime: zero()
		});
	}
	for (const s of counted) {
		const day = days.get(s.date) as HoursDay;
		day.workedMinutes += s.minutes;
		day.nightMinutes += nightMinutes(s.start, s.end, s.date, night(s.date));
	}

	const { off, weeks } = pickOffDays(
		dates.map((date) => {
			const fixed = personOn(date)?.fixedOffDays ?? null;
			const day = days.get(date) as HoursDay;
			return {
				date,
				fixedOff: fixed === null ? null : fixed.includes(day.weekday),
				workedMinutes: day.workedMinutes,
				hasAbsence: day.absenceType !== null
			};
		}),
		rule(from).weekStart,
		(date) => rule(date).offDaysPerWeek
	);

	// Required time and what the absences take off it (WH5, WH13).
	let required = 0;
	let credit = 0;
	let excused = 0;
	let paidAbsenceDays = 0;
	let unpaidDays = 0;
	let notExcusedDays = 0;
	for (const date of dates) {
		const day = days.get(date) as HoursDay;
		day.off = off.get(date) ?? null;
		required += weeklyOn(date) / 7;
		if (day.treatment === null || day.off !== null) continue;
		const share = absenceShare(weeklyOn(date), rule(date).offDaysPerWeek);
		if (day.treatment === 'paid') {
			credit += share;
			paidAbsenceDays++;
		} else if (day.treatment === 'unpaid') {
			excused += share;
			unpaidDays++;
		} else notExcusedDays++;
	}
	const requiredMinutes = Math.round(required);
	const creditMinutes = Math.round(credit);
	const excusedMinutes = Math.round(excused);
	const owedMinutes = Math.max(0, Math.round(required - credit - excused));

	const overtime = zero();
	const weighted = zero();
	let notPaidMinutes = 0;
	const add = (day: HoursDay, kind: OtKind, minutes: number) => {
		if (minutes <= 0) return;
		day.overtime[kind] += minutes;
		overtime[kind] += minutes;
		const { on, rate } = rateOf(kind, rule(day.date));
		if (on) weighted[kind] += minutes * rate;
		else notPaidMinutes += minutes;
	};

	// Off days: every minute is overtime, its night part at the off-day night rate when on (WH6).
	let offDayMinutes = 0;
	for (const s of counted) {
		const day = days.get(s.date) as HoursDay;
		if (day.off === null) continue;
		offDayMinutes += s.minutes;
		const n = nightMinutes(s.start, s.end, s.date, night(s.date));
		if (rule(s.date).offDayNightOn) {
			add(day, 'offDay', s.minutes - n);
			add(day, 'offDayNight', n);
		} else add(day, 'offDay', s.minutes);
	}

	// Work days: in time order, the minutes after the owed time is reached are overtime, day or
	// night by the clock (WH3, WH4).
	let left = owedMinutes;
	let workDayMinutes = 0;
	const work = counted
		.filter((s) => (days.get(s.date) as HoursDay).off === null)
		.sort((a, b) => a.start.getTime() - b.start.getTime());
	for (const s of work) {
		workDayMinutes += s.minutes;
		if (left >= s.minutes) {
			left -= s.minutes;
			continue;
		}
		const otStart = new Date(s.start.getTime() + left * MINUTE);
		const ot = s.minutes - left;
		const n = Math.min(ot, nightMinutes(otStart, s.end, s.date, night(s.date)));
		const day = days.get(s.date) as HoursDay;
		add(day, 'day', ot - n);
		add(day, 'night', n);
		left = 0;
	}

	const ruleVersionIds = [...new Set(dates.map((d) => rule(d).id))];
	return {
		...base,
		status: 'ok',
		requiredMinutes,
		creditMinutes,
		excusedMinutes,
		owedMinutes,
		workedMinutes: workDayMinutes + offDayMinutes,
		workDayMinutes,
		offDayMinutes,
		shortageMinutes: Math.max(0, owedMinutes - workDayMinutes),
		overtime,
		notPaidMinutes,
		weighted: {
			day: round2(weighted.day),
			night: round2(weighted.night),
			offDay: round2(weighted.offDay),
			offDayNight: round2(weighted.offDayNight),
			total: round2(weighted.day + weighted.night + weighted.offDay + weighted.offDayNight)
		},
		paidAbsenceDays,
		unpaidDays,
		notExcusedDays,
		ignoredSegments,
		days: [...days.values()],
		weeks,
		problems,
		ruleVersionIds
	};
}
