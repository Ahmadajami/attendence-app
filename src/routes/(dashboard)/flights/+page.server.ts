import { fail } from '@sveltejs/kit';
import { message, setError, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { hasPermission, requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	cancelFlight,
	createFlight,
	listFlightsByDay,
	updateFlight,
	type FlightInput
} from '#lib/server/services/flights.js';
import { parseDamascusDateTime } from '#lib/server/time.js';
import type { Actions, PageServerLoad } from './$types';
import { cancelFlightSchema, flightFormSchema, type FlightMessage } from './schema.js';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'flight.write'), permissions: locals.permissions };
}

function dateOrNull(value: string): Date | null {
	return value ? parseDamascusDateTime(value) : null;
}

function textOrNull(value: string): string | null {
	return value.trim() || null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals, 'flight.read');
	const rawDay = url.searchParams.get('day');
	const day = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : null;
	const board = await listFlightsByDay({ user, permissions: locals.permissions }, day);

	return {
		...board,
		canWrite: hasPermission(locals, 'flight.write'),
		form: await superValidate(zod4(flightFormSchema), { id: 'flight' })
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof flightFormSchema>, FlightMessage>(
			request,
			zod4(flightFormSchema),
			{ id: 'flight' }
		);
		if (!form.valid) return fail(400, { form });

		const scheduledAt = dateOrNull(form.data.scheduledAt);
		const handlingStartsAt = dateOrNull(form.data.handlingStartsAt);
		const handlingEndsAt = dateOrNull(form.data.handlingEndsAt);
		if (!scheduledAt) {
			return setError(form, 'scheduledAt', m.flights_schedule_invalid());
		}
		if (!handlingStartsAt || !handlingEndsAt) {
			return setError(form, 'handlingStartsAt', m.flights_window_required());
		}

		const input: FlightInput = {
			airlineCode: form.data.airlineCode,
			flightNo: form.data.flightNo,
			direction: form.data.direction,
			origin: textOrNull(form.data.origin),
			destination: textOrNull(form.data.destination),
			scheduledAt,
			status: form.data.status,
			aircraftType: textOrNull(form.data.aircraftType),
			stand: textOrNull(form.data.stand),
			gate: textOrNull(form.data.gate),
			imageUrl: textOrNull(form.data.imageUrl),
			handlingStartsAt,
			handlingEndsAt,
			overrideReason: textOrNull(form.data.overrideReason)
		};

		try {
			const flight = form.data.flightId
				? await updateFlight(actor, form.data.flightId, input)
				: await createFlight(actor, input);
			return message(form, {
				kind: 'success',
				text: form.data.flightId
					? m.flights_updated({ flight: `${flight.airlineCode} ${flight.flightNo}` })
					: m.flights_created({ flight: `${flight.airlineCode} ${flight.flightNo}` })
			} satisfies FlightMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	cancel: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = cancelFlightSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.flights_error_not_found() });

		try {
			const flight = await cancelFlight(actor, parsed.data.flightId);
			return {
				notice: m.flights_cancelled({ flight: `${flight.airlineCode} ${flight.flightNo}` })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
