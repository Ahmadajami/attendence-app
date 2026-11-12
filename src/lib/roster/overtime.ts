import { LONG_DAY_WARNING_MINUTES } from './rules.js';

export type Overtime = {
	/** Minutes past the required time, before rounding. */
	rawMinutes: number;
	/** Rounded by the day's rule (`OvertimeRounding`): what is shown and approved. */
	minutes: number;
	/** More than 18 h worked on the shift date. */
	warning: boolean;
};

/** `nearest` rounds half up (7 → 0, 8 → 15 at step 15); `up` and `down` always go that way. */
export type RoundingMode = 'nearest' | 'up' | 'down';

/** The overtime rounding of one day. `step` 0: no rounding (Odoo's October rule, OC7). */
export type OvertimeRounding = { step: number; mode: RoundingMode };

export const NO_ROUNDING: OvertimeRounding = { step: 0, mode: 'nearest' };

/** Round minutes to the rule's step. Minutes are never negative here (overtime is `>= 0`). */
export function roundMinutes(minutes: number, { step, mode }: OvertimeRounding): number {
	if (step <= 0) return minutes;
	const quotient = minutes / step;
	const steps =
		mode === 'up'
			? Math.ceil(quotient)
			: mode === 'down'
				? Math.floor(quotient)
				: Math.round(quotient);
	return steps * step;
}

/**
 * Overtime for one shift date. On a rostered shift it is the time past the shift's required minutes;
 * on an extra shift or an unscheduled day all of it is overtime. Per day only: nothing carries over.
 * Credit minutes (Friday prayer) never count here: they are added by the caller, not overtime.
 */
export function computeOvertime(
	workedMinutes: number,
	requiredMinutes: number,
	allOvertime: boolean,
	rounding: OvertimeRounding = NO_ROUNDING
): Overtime {
	const rawMinutes = Math.max(0, workedMinutes - (allOvertime ? 0 : requiredMinutes));
	return {
		rawMinutes,
		minutes: roundMinutes(rawMinutes, rounding),
		warning: workedMinutes > LONG_DAY_WARNING_MINUTES
	};
}

/** `none`: nothing to approve; `pending`: not approved yet; `changed`: approved, then corrected. */
export type ApprovalState = 'none' | 'pending' | 'approved' | 'changed';

/**
 * Minutes someone approved for a day. The template's `overtime_approval` table was removed (payroll
 * uses the Odoo rules, plan D19); this shape stays until `src/lib/payroll/` replaces these rules.
 */
export type ApprovedOvertime = { minutes: number };

export function approvalState(minutes: number, approval: ApprovedOvertime | null): ApprovalState {
	if (approval) return approval.minutes === minutes ? 'approved' : 'changed';
	return minutes > 0 ? 'pending' : 'none';
}

/** 135 → 2.25. Format for display with the locale's number formatter. */
export function toDecimalHours(minutes: number): number {
	return minutes / 60;
}

/** 135 → `2:15`. Show inside `<bdi>`. */
export function formatHoursMinutes(minutes: number): string {
	return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
