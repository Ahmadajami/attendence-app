import { m } from '#lib/paraglide/messages.js';
import type { AttendanceRules } from '#lib/roster/attendance-rules.js';
import type { RoundingMode } from '#lib/roster/overtime.js';

// How the attendance rules read on the admin page (OC7): the rounding and the prayer credit in one
// line each, and the choices of the form.

export const MODE_LABEL: Record<RoundingMode, () => string> = {
	nearest: m.attendance_rules_mode_nearest,
	up: m.attendance_rules_mode_up,
	down: m.attendance_rules_mode_down
};

/** `None`, or `15 min, nearest`. */
export function roundingLabel(
	rules: Pick<AttendanceRules, 'overtimeStep' | 'overtimeMode'>
): string {
	if (rules.overtimeStep <= 0) return m.attendance_rules_rounding_none();
	return m.attendance_rules_rounding_value({
		step: rules.overtimeStep,
		mode: MODE_LABEL[rules.overtimeMode]()
	});
}

/** `Off`, or `60 min, 2 punch segments`. */
export function prayerLabel(
	rules: Pick<AttendanceRules, 'fridayPrayerOn' | 'fridayPrayerMinutes' | 'fridayPrayerSegments'>
): string {
	if (!rules.fridayPrayerOn) return m.attendance_rules_prayer_off();
	return m.attendance_rules_prayer_value({
		minutes: rules.fridayPrayerMinutes,
		segments: rules.fridayPrayerSegments
	});
}

export const STEP_LABEL = (step: number): string =>
	step <= 0 ? m.attendance_rules_step_none() : m.attendance_rules_step_minutes({ step });
