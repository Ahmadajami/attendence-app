import type { OvertimeRounding, RoundingMode } from './overtime.js';

// The attendance rules that vary by date (plans/2026-11-12-attendance-rules-settings.md, OC7; EN1,
// EN2, FP1): overtime rounding and the Friday Prayer credit. Company versions only for now: each
// version holds every field, and a day with no version in force uses the built-in defaults. Odoo's
// values are the defaults, so October keeps them even if a later version changes them. Pure and
// client-safe.

/** The overtime steps an admin can pick, in minutes; `0` is no rounding (Odoo). */
export const OVERTIME_STEPS = [0, 5, 10, 15, 30] as const;

export const ROUNDING_MODES = ['nearest', 'up', 'down'] as const satisfies readonly RoundingMode[];

export type AttendanceRules = {
	/** Overtime rounding step in minutes; `0` = none. */
	overtimeStep: number;
	overtimeMode: RoundingMode;
	/** Friday Prayer credit on or off. */
	fridayPrayerOn: boolean;
	/** Paid credit minutes on a qualifying Friday (FP1: 60). */
	fridayPrayerMinutes: number;
	/** Punch segments a Friday needs for the credit (FP1: two). */
	fridayPrayerSegments: number;
};

/** Odoo's rules: no overtime rounding, a 60-minute prayer credit on a Friday with two segments. */
export const ATTENDANCE_RULE_DEFAULTS: AttendanceRules = {
	overtimeStep: 0,
	overtimeMode: 'nearest',
	fridayPrayerOn: true,
	fridayPrayerMinutes: 60,
	fridayPrayerSegments: 2
};

/** A stored company version: its rule fields, its id and its dates (`effectiveTo` exclusive). */
export type AttendanceRuleVersion = AttendanceRules & {
	id: string;
	effectiveFrom: string;
	effectiveTo: string | null;
};

/** The rules of one day, and where they came from (the day's explanation keeps both). */
export type ResolvedAttendanceRules = {
	rules: AttendanceRules;
	/** The version in force, `null` when the built-in defaults apply. */
	versionId: string | null;
	source: 'default' | 'company';
};

export const DEFAULT_RESOLVED: ResolvedAttendanceRules = {
	rules: ATTENDANCE_RULE_DEFAULTS,
	versionId: null,
	source: 'default'
};

/** The version in force on `date`: from its start up to, not including, its end. */
export function attendanceVersionOn<
	V extends { effectiveFrom: string; effectiveTo: string | null }
>(versions: readonly V[], date: string): V | undefined {
	return versions.find(
		(v) => v.effectiveFrom <= date && (v.effectiveTo === null || date < v.effectiveTo)
	);
}

/** The rules on `date`: the company version in force, else the built-in defaults. */
export function attendanceRulesOn(
	versions: readonly AttendanceRuleVersion[],
	date: string
): ResolvedAttendanceRules {
	const version = attendanceVersionOn(versions, date);
	if (!version) return DEFAULT_RESOLVED;
	const { id, effectiveFrom: _from, effectiveTo: _to, ...rules } = version;
	void _from;
	void _to;
	return { rules, versionId: id, source: 'company' };
}

export const roundingOf = (rules: AttendanceRules): OvertimeRounding => ({
	step: rules.overtimeStep,
	mode: rules.overtimeMode
});

/** Friday, by the calendar date (`yyyy-mm-dd`, read as UTC so no zone can move it). */
export function isFriday(date: string): boolean {
	return new Date(`${date}T00:00:00Z`).getUTCDay() === 5;
}

/**
 * The Friday Prayer credit of one shift date (FP1): on a planned work day that is a Friday, with
 * exactly the required punch segments and the setting on. Zero otherwise.
 */
export function fridayPrayerCredit(input: {
	shiftDate: string;
	workDay: boolean;
	segments: number;
	rules: AttendanceRules;
}): number {
	const { rules } = input;
	if (!rules.fridayPrayerOn || !input.workDay || !isFriday(input.shiftDate)) return 0;
	return input.segments === rules.fridayPrayerSegments ? rules.fridayPrayerMinutes : 0;
}
