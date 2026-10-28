import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

export const flightStatusValues = [
	'scheduled',
	'delayed',
	'boarding',
	'departed',
	'arrived',
	'cancelled',
	'diverted'
] as const;

export const flightFormSchema = z
	.object({
		flightId: z.union([z.literal(''), z.uuid()]).default(''),
		airlineCode: z
			.string()
			.trim()
			.min(1, { error: () => m.flights_airline_required() })
			.max(8)
			.transform((value) => value.toUpperCase()),
		flightNo: z
			.string()
			.trim()
			.min(1, { error: () => m.flights_number_required() })
			.max(12)
			.transform((value) => value.toUpperCase()),
		direction: z.enum(['arrival', 'departure'], {
			error: () => m.flights_direction_required()
		}),
		origin: z.string().trim().max(80).default(''),
		destination: z.string().trim().max(80).default(''),
		scheduledAt: z
			.string()
			.trim()
			.min(1, { error: () => m.flights_schedule_required() }),
		status: z.enum(flightStatusValues),
		aircraftType: z.string().trim().max(60).default(''),
		stand: z.string().trim().max(20).default(''),
		gate: z.string().trim().max(20).default(''),
		imageUrl: z
			.string()
			.trim()
			.max(500)
			.default('')
			.refine((value) => !value || /^https:\/\/\S+$/i.test(value), {
				error: () => m.flights_image_invalid()
			}),
		handlingStartsAt: z
			.string()
			.trim()
			.min(1, { error: () => m.flights_window_required() }),
		handlingEndsAt: z
			.string()
			.trim()
			.min(1, { error: () => m.flights_window_required() }),
		/** Required by the BL only when the window is an override (`isHandlingOverride`). */
		overrideReason: z.string().trim().max(500).default('')
	})
	.superRefine((value, ctx) => {
		if (
			value.handlingStartsAt &&
			value.handlingEndsAt &&
			value.handlingEndsAt <= value.handlingStartsAt
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['handlingEndsAt'],
				message: m.flights_window_invalid()
			});
		}
	});

export const cancelFlightSchema = z.object({
	flightId: z.uuid()
});

export type FlightMessage = { kind: 'success' | 'error'; text: string };
