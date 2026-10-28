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

/** Where a punch came from: typed in the app, the one-time Odoo seed, or a punch file (S1.6). */
export const PUNCH_SOURCES = ['manual', 'seed', 'import'] as const;
export type PunchSource = (typeof PUNCH_SOURCES)[number];

export const ABSENCE_TYPES = ['sick', 'leave', 'no_show', 'other'] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

/**
 * The shift palette (no free colour input). The stored value is a palette key; the colour shown
 * comes from the `shift-1`…`shift-8` theme tokens in `src/routes/layout.css` (same order, light and
 * dark), via `shiftColourClass()`. D and N are seeded with the first two
 * (`drizzle/0005_shift_constraints_seed.sql`).
 */
export const SHIFT_COLOURS = [
	'#b45309', // amber
	'#4338ca', // indigo
	'#0369a1', // sky
	'#047857', // emerald
	'#be123c', // rose
	'#6d28d9', // violet
	'#0f766e', // teal
	'#475569' // slate
] as const;
export type ShiftColour = (typeof SHIFT_COLOURS)[number];
