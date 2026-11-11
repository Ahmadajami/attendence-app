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

/** A full-day state of one person. `mission`: a pattern mission (pay plan PR9). */
export const ABSENCE_TYPES = ['sick', 'leave', 'no_show', 'other', 'mission'] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

/**
 * Which rule decided a roster day, highest precedence first (`rosterDay()` in
 * `#lib/roster/roster.ts`).
 */
export const ROSTER_SOURCES = [
	'absence',
	'override',
	'personal',
	'team',
	'department',
	'none'
] as const;
export type RosterSource = (typeof ROSTER_SOURCES)[number];

/** A shift date's attendance status (`shiftSummary()` in `#lib/roster/attendance.ts`). */
export const DAY_STATUSES = [
	'expected',
	'present',
	'late',
	'on_break',
	'done',
	'missing',
	'absent',
	'off',
	'unscheduled'
] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

/**
 * How a day is paid (pay plan §4): a rostered work day; work on an off day or an extra shift; work
 * on a holiday; a holiday not worked; a full-day absence; an off day not worked.
 */
export const DAY_KINDS = [
	'work',
	'off_work',
	'holiday_work',
	'holiday_off',
	'absence',
	'off'
] as const;
export type DayKind = (typeof DAY_KINDS)[number];

/** Why extra minutes on a day are not paid as overtime (pay plan PR3, PR15, PR19). */
export const UNPAID_REASONS = [
	'ot_off',
	'person_no_ot',
	'holiday_not_eligible',
	'absence'
] as const;
export type UnpaidReason = (typeof UNPAID_REASONS)[number];

/** The values of a day the edit log tracks (pay plan PR22); `created`: the day's first computation. */
export const LOG_FIELDS = [
	'created',
	'kind',
	'status',
	'state',
	'shift',
	'check_in',
	'check_out',
	'required',
	'worked',
	'late',
	'overtime',
	'ot_rate',
	'paid_ot',
	'unpaid_extra',
	'swap'
] as const;
export type LogField = (typeof LOG_FIELDS)[number];

/**
 * Where a change to a day came from (PR23): typed on a screen, a punch file or device, the Odoo
 * seed, a correction, or one of the things that change a day; `system`: backfill and catch-up.
 */
export const LOG_SOURCES = [
	'typed',
	'punch_reading',
	'odoo_seed',
	'correction',
	'day_edit',
	'mission',
	'swap',
	'holiday',
	'pay_rule',
	'roster_change',
	'system'
] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

/** Which record caused a log line (`cause_id` points into that table; `none`: no single record). */
export const LOG_CAUSES = [
	'event',
	'absence',
	'swap',
	'holiday',
	'pay_rule',
	'assignment',
	'schedule',
	'override',
	'none'
] as const;
export type LogCause = (typeof LOG_CAUSES)[number];

/**
 * Self swap: a person's work day becomes off and their off day works that shift. Employee swap: on
 * a date A works and B is off, then B works A's shift; an optional return date reverses it (PR26).
 */
/** `shift_change`: one person, one date, another shift (plan 2026-11-11-shift-change-request). */
export const SWAP_KINDS = ['self_swap', 'emp_swap', 'shift_change'] as const;
export type SwapKind = (typeof SWAP_KINDS)[number];

/** Both days of a swap lie in the same Sunday–Saturday week, or the same calendar month. */
export const SWAP_SCOPES = ['week', 'month'] as const;
export type SwapScope = (typeof SWAP_SCOPES)[number];

/** A swap changes the roster only once approved (PR25); an approved one may be cancelled. */
export const SWAP_STATES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type SwapState = (typeof SWAP_STATES)[number];

/** A day a swap turned into work (`swap_on`) or into an off day (`swap_off`), R12. */
export const SWAP_ROLES = ['swap_on', 'swap_off'] as const;
export type SwapRole = (typeof SWAP_ROLES)[number];

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
