import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { SHIFT_COLOURS } from './enums.js';

/** `HH:mm` (00:00–23:59), a Damascus wall-clock time. */
const clock = z
	.string()
	.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { error: () => m.shifts_time_invalid() });

const minutes = (min: number, max: number) =>
	z
		.number({ error: () => m.shifts_minutes_invalid({ min, max }) })
		.int({ error: () => m.shifts_minutes_invalid({ min, max }) })
		.min(min, { error: () => m.shifts_minutes_invalid({ min, max }) })
		.max(max, { error: () => m.shifts_minutes_invalid({ min, max }) });

const name = z
	.string()
	.trim()
	.min(1, { error: () => m.shifts_name_required() })
	.max(60);

/**
 * Create or edit a shift. An end at or before the start ends the next day. Once a shift is used,
 * the service refuses changes to everything but names, colour and grace (plan P1).
 */
export const shiftFormSchema = z.object({
	/** '' = create. */
	shiftId: z.union([z.literal(''), z.uuid()]).default(''),
	code: z
		.string()
		.trim()
		.regex(/^[A-Z0-9]{1,3}$/, { error: () => m.shifts_code_invalid() })
		.refine((code) => code !== 'OFF', { error: () => m.shifts_code_reserved() }),
	nameEn: name,
	nameAr: name,
	colour: z
		.enum(SHIFT_COLOURS, { error: () => m.shifts_colour_required() })
		.default(SHIFT_COLOURS[0]),
	startTime: clock,
	endTime: clock,
	breakMinutes: minutes(0, 720).default(0),
	/** `null`: the span minus the break. */
	requiredMinutes: minutes(1, 1440).nullable().default(null),
	windowBeforeMinutes: minutes(0, 720).default(180),
	windowAfterMinutes: minutes(0, 720).default(360),
	/** 0 = not set: the default grace applies. */
	graceMinutes: minutes(0, 120).default(0)
});
export type ShiftFormSchema = typeof shiftFormSchema;
export type ShiftFormData = z.infer<ShiftFormSchema>;
/** The shifts service's create / update input. */
export type ShiftInput = Omit<ShiftFormData, 'shiftId'>;

export const setShiftActiveSchema = z.object({
	shiftId: z.uuid(),
	active: z.enum(['true', 'false'])
});

/** Superforms status message for the create / edit sheet. */
export type ShiftMessage = { kind: 'success' | 'error'; text: string };
