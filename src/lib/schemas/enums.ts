// Closed sets shared by the database (`pgEnum`), zod schemas and label functions (CLAUDE.md §3).
// Client-safe: no server imports.

/** A pattern repeats by weekday (7 slots, Sunday first) or as a cycle of 1–28 days from an anchor. */
export const PATTERN_TYPES = ['weekly', 'cycle'] as const;
export type PatternType = (typeof PATTERN_TYPES)[number];

/** Append-only attendance events; corrections are new events, never edits. */
export const ATTENDANCE_EVENT_TYPES = [
	'check_in',
	'check_out',
	'break_start',
	'break_end'
] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export const ABSENCE_TYPES = ['sick', 'leave', 'no_show', 'other'] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];
