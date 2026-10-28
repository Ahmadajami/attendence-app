import type { OvertimeApproval } from '#lib/server/db/schema/index.js';
import { LONG_DAY_WARNING_MINUTES, OVERTIME_ROUNDING_MINUTES, SHIFT_MINUTES } from './rules.js';

export type Overtime = {
	/** Minutes past the required time, before rounding. */
	rawMinutes: number;
	/** Rounded to the nearest 15 min: what is shown and approved. */
	minutes: number;
	/** More than 18 h worked on the shift date. */
	warning: boolean;
};

/** Nearest quarter hour, half up: 7 → 0, 8 → 15, 40 → 45. */
export function roundOvertime(minutes: number): number {
	return Math.round(minutes / OVERTIME_ROUNDING_MINUTES) * OVERTIME_ROUNDING_MINUTES;
}

/**
 * Overtime for one shift date. On a rostered shift it is the time past 12 h; on an extra shift or
 * an unscheduled day all of it is overtime. Per day only: nothing carries over.
 */
export function computeOvertime(workedMinutes: number, allOvertime: boolean): Overtime {
	const rawMinutes = Math.max(0, workedMinutes - (allOvertime ? 0 : SHIFT_MINUTES));
	return {
		rawMinutes,
		minutes: roundOvertime(rawMinutes),
		warning: workedMinutes > LONG_DAY_WARNING_MINUTES
	};
}

/** `none`: nothing to approve; `pending`: not approved yet; `changed`: approved, then corrected. */
export type ApprovalState = 'none' | 'pending' | 'approved' | 'changed';

export function approvalState(
	minutes: number,
	approval: Pick<OvertimeApproval, 'minutes'> | null
): ApprovalState {
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
