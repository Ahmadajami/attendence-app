// The owner's roster rules (ROSTER_PLAN.md Decisions), in one place so the engine and its tests
// agree. Client-safe.

/** Every shift is 12 h, Day or Night; a rostered shift's required time. */
export const SHIFT_MINUTES = 12 * 60;

/** A cycle is 1–28 days (also a `CHECK` on `shift_pattern.cycle`). */
export const MAX_CYCLE_DAYS = 28;

/** A check-in more than this after the shift start is late; after it with no check-in, missing. */
export const LATE_GRACE_MINUTES = 15;

/** An event belongs to a shift from this long before its start… */
export const ATTRIBUTION_BEFORE_MINUTES = 2 * 60;

/** …to this long after its end, so a long overtime stay still counts for its shift. */
export const ATTRIBUTION_AFTER_MINUTES = 7 * 60;

/** Overtime is rounded to the nearest quarter hour (half up). */
export const OVERTIME_ROUNDING_MINUTES = 15;

/** More than this worked on one shift date shows a warning (12 h + a half shift). */
export const LONG_DAY_WARNING_MINUTES = 18 * 60;
