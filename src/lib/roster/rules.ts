// The owner's roster rules (ROSTER_PLAN.md Decisions), in one place so the engine and its tests
// agree. Client-safe.

/** A cycle is 1–28 days (also a `CHECK` on `shift_pattern.slots`); a weekly pattern has 7. */
export const MAX_CYCLE_DAYS = 28;

/**
 * A check-in more than this after the shift start is late; after it with no check-in, missing. The
 * default for shifts without their own grace.
 */
export const LATE_GRACE_MINUTES = 15;

/** Overtime is rounded to the nearest quarter hour (half up). */
export const OVERTIME_ROUNDING_MINUTES = 15;

/** More than this worked on one shift date shows a warning (12 h + a half shift). */
export const LONG_DAY_WARNING_MINUTES = 18 * 60;
