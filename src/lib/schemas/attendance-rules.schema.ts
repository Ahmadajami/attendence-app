import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

// The company's attendance rules (OC7): overtime rounding and the Friday Prayer credit, from a date.
// One shared schema for the admin form (Superforms, client and server) and the service. Dates are
// `yyyy-mm-dd`; the choices are the form's strings, the service turns the step into minutes.

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });

const reason = z
	.string()
	.trim()
	.min(1, { error: () => m.roster_reason_required() })
	.max(500);

/** The overtime rounding steps in the form (minutes as text; `0` = none). */
export const ROUNDING_STEP_CHOICES = ['0', '5', '10', '15', '30'] as const;
export const ROUNDING_MODE_CHOICES = ['nearest', 'up', 'down'] as const;

export const attendanceRuleFormSchema = z.object({
	effectiveFrom: isoDate,
	overtimeStep: z.enum(ROUNDING_STEP_CHOICES, {
		error: () => m.attendance_rules_error_step()
	}),
	overtimeMode: z.enum(ROUNDING_MODE_CHOICES, {
		error: () => m.attendance_rules_error_mode()
	}),
	fridayPrayerOn: z.boolean(),
	fridayPrayerMinutes: z
		.number({ error: () => m.attendance_rules_error_prayer_minutes() })
		.int({ error: () => m.attendance_rules_error_prayer_minutes() })
		.min(0, { error: () => m.attendance_rules_error_prayer_minutes() })
		.max(240, { error: () => m.attendance_rules_error_prayer_minutes() }),
	fridayPrayerSegments: z
		.number({ error: () => m.attendance_rules_error_prayer_segments() })
		.int({ error: () => m.attendance_rules_error_prayer_segments() })
		.min(1, { error: () => m.attendance_rules_error_prayer_segments() })
		.max(10, { error: () => m.attendance_rules_error_prayer_segments() }),
	reason
});

export type AttendanceRuleFormSchema = typeof attendanceRuleFormSchema;
export type AttendanceRuleInput = z.infer<typeof attendanceRuleFormSchema>;
