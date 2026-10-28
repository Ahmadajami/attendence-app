// Closed sets shared by the database (`pgEnum`), zod schemas and label functions (CLAUDE.md §3).
// Client-safe: no server imports.

/** A rostered day: a 12 h Day or Night shift, or Off (ROSTER_PLAN.md). */
export const SHIFT_KINDS = ['day', 'night', 'off'] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

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
