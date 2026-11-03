import { absenceLabel } from '#lib/attendance/labels.js';
import { clockOf } from '#lib/attendance/entry.js';
import { m } from '#lib/paraglide/messages.js';
import { formatHoursMinutes } from '#lib/roster/overtime.js';
import type { DailySource } from '#lib/schemas/day-results.schema.js';
import {
	ABSENCE_TYPES,
	DAY_KINDS,
	DAY_STATUSES,
	type AbsenceType,
	type DayKind,
	type DayStatus,
	type LogField,
	type LogSource,
	type PunchSource,
	type SwapRole,
	type UnpaidReason
} from '#lib/schemas/enums.js';
import { formatRate } from '../patterns/pay-labels.js';

// Labels of the stored daily attendance (pay plan PR20–PR24): the daily page, the day editor, the
// History sheet, and the figures on the entry sheet and the employee page.

export const DAY_STATUS_LABEL: Record<DayStatus, () => string> = {
	expected: m.daily_status_expected,
	present: m.daily_status_present,
	late: m.daily_status_late,
	on_break: m.daily_status_on_break,
	done: m.daily_status_done,
	missing: m.daily_status_missing,
	absent: m.daily_status_absent,
	off: m.daily_status_off,
	unscheduled: m.daily_status_unscheduled
};

export const DAY_KIND_LABEL: Record<DayKind, () => string> = {
	work: m.daily_kind_work,
	off_work: m.daily_kind_off_work,
	holiday_work: m.daily_kind_holiday_work,
	holiday_off: m.daily_kind_holiday_off,
	absence: m.daily_kind_absence,
	off: m.daily_kind_off
};

export const UNPAID_REASON_LABEL: Record<UnpaidReason, () => string> = {
	ot_off: m.daily_unpaid_ot_off,
	person_no_ot: m.daily_unpaid_person_no_ot,
	holiday_not_eligible: m.daily_unpaid_holiday_not_eligible,
	absence: m.daily_unpaid_absence
};

/** The in / out badge (PR24): `manual` = Typed, `import` = Punch reading, `seed` = Odoo seed. */
export const PUNCH_SOURCE_LABEL: Record<PunchSource, () => string> = {
	manual: m.daily_source_typed,
	import: m.daily_source_punch_reading,
	seed: m.daily_source_odoo_seed
};

export const DAILY_SOURCE_LABEL: Record<DailySource, () => string> = {
	typed: m.daily_source_typed,
	punch_reading: m.daily_source_punch_reading,
	odoo_seed: m.daily_source_odoo_seed,
	corrected: m.daily_source_corrected
};

export const SWAP_ROLE_LABEL: Record<SwapRole, () => string> = {
	swap_on: m.daily_badge_swap_on,
	swap_off: m.daily_badge_swap_off
};

export const LOG_FIELD_LABEL: Record<LogField, () => string> = {
	created: m.day_history_field_created,
	kind: m.day_history_field_kind,
	status: m.day_history_field_status,
	state: m.day_history_field_state,
	shift: m.day_history_field_shift,
	check_in: m.day_history_field_check_in,
	check_out: m.day_history_field_check_out,
	required: m.day_history_field_required,
	worked: m.day_history_field_worked,
	late: m.day_history_field_late,
	overtime: m.day_history_field_overtime,
	ot_rate: m.day_history_field_ot_rate,
	paid_ot: m.day_history_field_paid_ot,
	unpaid_extra: m.day_history_field_unpaid_extra,
	swap: m.day_history_field_swap
};

export const LOG_SOURCE_LABEL: Record<LogSource, () => string> = {
	typed: m.daily_source_typed,
	punch_reading: m.daily_source_punch_reading,
	odoo_seed: m.daily_source_odoo_seed,
	correction: m.day_history_source_correction,
	day_edit: m.day_history_source_day_edit,
	mission: m.day_history_source_mission,
	swap: m.day_history_source_swap,
	holiday: m.day_history_source_holiday,
	pay_rule: m.day_history_source_pay_rule,
	roster_change: m.day_history_source_roster_change,
	system: m.day_history_source_system
};

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
	typeof value === 'string' && values.includes(value as T);

/**
 * A logged value as text (PR22): minutes as `h:mm`, instants as the Damascus clock, rates as
 * `×1.25`, enum keys by their label; a shift by its code when `shiftCode` knows it.
 */
export function formatLogValue(
	field: LogField,
	value: string | number | boolean | null,
	shiftCode: (id: string) => string | undefined = () => undefined
): string {
	if (value === null) return '—';
	switch (field) {
		case 'created':
		case 'kind':
			return isOneOf(DAY_KINDS, value) ? DAY_KIND_LABEL[value]() : String(value);
		case 'status':
			return isOneOf(DAY_STATUSES, value) ? DAY_STATUS_LABEL[value]() : String(value);
		case 'state':
			return isOneOf<AbsenceType>(ABSENCE_TYPES, value) ? absenceLabel(value) : String(value);
		case 'shift':
			return typeof value === 'string' ? (shiftCode(value) ?? '—') : String(value);
		case 'check_in':
		case 'check_out':
			return typeof value === 'string' ? clockOf(new Date(value)) : String(value);
		case 'ot_rate':
			return typeof value === 'number' ? formatRate(value) : String(value);
		case 'swap':
			return value === 'swap_on' || value === 'swap_off' ? SWAP_ROLE_LABEL[value]() : String(value);
		default:
			return typeof value === 'number' ? formatHoursMinutes(value) : String(value);
	}
}
