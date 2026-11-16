import { versionOn } from '#lib/payroll/pay-rule.js';
import type { AbsenceType } from '#lib/schemas/enums.js';

// The settings of the weekly hours engine (plan 2026-11-16, WH6, WH8, WH13). Every value is set
// in the app as a dated company version; nothing here is a business default except how each
// absence type counts until HR changes it. Pure: no DB or SvelteKit imports.

export { versionOn };

/**
 * How a full-day absence counts against the hours owed (WH13):
 * - `paid`: the day's share is credited as paid time (never overtime);
 * - `unpaid`: the day's share is excused (no shortage) and the day is listed as unpaid;
 * - `not_excused`: the day stays owed, so it shows as a shortage.
 */
export const ABSENCE_TREATMENTS = ['paid', 'unpaid', 'not_excused'] as const;
export type AbsenceTreatment = (typeof ABSENCE_TREATMENTS)[number];

/** How each absence type counts until HR changes it (WH13, approved 2026-11-16). */
export const DEFAULT_ABSENCE_TREATMENT: Readonly<Record<AbsenceType, AbsenceTreatment>> =
	Object.freeze({
		leave: 'paid',
		sick: 'paid',
		mission: 'paid',
		other: 'unpaid',
		no_show: 'not_excused'
	});

/** One company version (`hours_rule`). Times are wall-clock `HH:MM` in the timezone setting. */
export type HoursRule = {
	weeklyMinutes: number;
	offDaysPerWeek: number;
	/** 0 = Sunday … 6 = Saturday. */
	weekStart: number;
	/** The night window; it crosses midnight when `nightEnd` ≤ `nightStart`; equal: no night. */
	nightStart: string;
	nightEnd: string;
	dayOtOn: boolean;
	dayOtRate: number;
	nightOtOn: boolean;
	nightOtRate: number;
	offDayOtOn: boolean;
	offDayOtRate: number;
	/** On: night minutes of an off day take `offDayNightRate`; off: they take `offDayOtRate`. */
	offDayNightOn: boolean;
	offDayNightRate: number | null;
	absenceTreatment: Record<AbsenceType, AbsenceTreatment>;
};

export type Dated = { effectiveFrom: string; effectiveTo: string | null };

export type HoursRuleVersion = HoursRule & Dated & { id: string };

/** One person version (`staff_hours`): `null` inherits the company value or floats. */
export type StaffHoursVersion = Dated & {
	id: string;
	weeklyMinutes: number | null;
	/** Fixed off weekdays (0 = Sunday); `null`: the off days float (WH2). */
	fixedOffDays: number[] | null;
};

/** A day's share of the weekly hours for an absence: weekly ÷ the work days of a week (WH5). */
export function absenceShare(weeklyMinutes: number, offDaysPerWeek: number): number {
	const workDays = 7 - offDaysPerWeek;
	return workDays > 0 ? weeklyMinutes / workDays : 0;
}
