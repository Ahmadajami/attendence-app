import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

/** `HH:mm` (00:00–23:59), a Damascus wall-clock time typed on the entry sheet. */
const clock = z
	.string()
	.trim()
	.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { error: () => m.attendance_time_invalid() });
const optionalClock = z.union([z.literal(''), clock]);

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });

/** Absences the entry sheet can set in one click (the full list comes with S3/S4). */
export const ENTRY_ABSENCES = ['no_show', 'leave', 'sick'] as const;
export type EntryAbsence = (typeof ENTRY_ABSENCES)[number];

/**
 * One person on the entry sheet: the date's check-in and check-out, no shift (the roster decides,
 * plan PS1–PS3). Rows with no times and no absence are skipped. `reason` is an optional note (PS4);
 * for an absence it may hold health details, so it is never logged.
 */
export const entryRowSchema = z
	.object({
		staffId: z.uuid(),
		checkIn: optionalClock.default(''),
		checkOut: optionalClock.default(''),
		absence: z.union([z.literal(''), z.enum(ENTRY_ABSENCES)]).default(''),
		reason: z.string().trim().max(500).default('')
	})
	.superRefine((row, ctx) => {
		if (row.absence && (row.checkIn || row.checkOut))
			ctx.addIssue({
				code: 'custom',
				path: ['absence'],
				message: m.attendance_absence_and_times()
			});
		if (row.checkOut && !row.checkIn)
			ctx.addIssue({
				code: 'custom',
				path: ['checkIn'],
				message: m.attendance_check_in_required()
			});
	});
export type EntryRow = z.infer<typeof entryRowSchema>;

/** The whole entry sheet of one shift date. Posted as JSON (Superforms `dataType: 'json'`). */
export const entrySheetSchema = z.object({
	shiftDate: isoDate,
	rows: z.array(entryRowSchema).max(500).default([])
});
export type EntrySheetSchema = typeof entrySheetSchema;
export type EntrySheetInput = z.infer<EntrySheetSchema>;

/** One pair added from the employee page's day panel. */
export const addPairSchema = z.object({
	staffId: z.uuid(),
	shiftDate: isoDate,
	checkIn: clock,
	checkOut: optionalClock.default(''),
	reason: z.string().trim().max(500).default('')
});
export type AddPairInput = z.infer<typeof addPairSchema>;

/**
 * A correction: a new time for the event, or `voidEvent` (a void correction that removes it). Not
 * `remove`: a form control's name becomes a property of its `<form>`, and an input named `remove`
 * hides `HTMLFormElement.remove()`, which Superforms calls when the form is destroyed.
 */
export const correctionSchema = z
	.object({
		eventId: z.uuid(),
		time: optionalClock.default(''),
		voidEvent: z.boolean().default(false),
		reason: z
			.string()
			.trim()
			.min(1, { error: () => m.roster_reason_required() })
			.max(500)
	})
	.superRefine((value, ctx) => {
		if (!value.voidEvent && !value.time)
			ctx.addIssue({ code: 'custom', path: ['time'], message: m.attendance_time_required() });
	});
export type CorrectionInput = z.infer<typeof correctionSchema>;

/**
 * The day editor's check-in / check-out of one person and shift date (pay plan PR46–PR48). With no
 * punches yet it adds a pair; with one pair it corrects what changed. No shift: the roster decides
 * (plan PS1). The reason is required and saved on every event written.
 */
export const dayPunchesSchema = z.object({
	staffId: z.uuid(),
	shiftDate: isoDate,
	checkIn: clock,
	checkOut: optionalClock.default(''),
	reason: z
		.string()
		.trim()
		.min(1, { error: () => m.roster_reason_required() })
		.max(500)
});
export type DayPunchesSchema = typeof dayPunchesSchema;
export type DayPunchesInput = z.infer<DayPunchesSchema>;

/** Superforms status message of the attendance forms. */
export type { StatusMessage as AttendanceMessage } from '#lib/utils/form-toasts.js';
