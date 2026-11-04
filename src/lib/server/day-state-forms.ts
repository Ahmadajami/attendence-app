import { fail, type RequestEvent } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { dayPunchesSchema, type AttendanceMessage } from '#lib/schemas/attendance.schema.js';
import { dayStateClearSchema, dayStateFormSchema } from '#lib/schemas/day-state.schema.js';
import { failForm } from '#lib/server/errors.js';
import { setDayPunches } from '#lib/server/services/attendance/attendance.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import { clearDayState, setDayState } from '#lib/server/services/day-state/day-state.bl.js';

// The day editor's forms (pay plan PR19, task 5.2; check-in / out PR46), shared by
// `/attendance/days` and the employee page's day panel. The sheet fills the person and dates when
// it opens (the check-in / out form starts from the day's punches, loaded on open); the services
// check `attendance.record` on every write.

const options = { errors: false } as const;

/** Set-a-state and clear-the-state forms, starting on `today`. */
export async function dayStateForms(today: string) {
	return {
		set: await superValidate(
			{ staffId: '', startsOn: today, endsOn: today, reason: '' },
			zod4(dayStateFormSchema),
			{ ...options, id: 'day-state' }
		),
		clear: await superValidate(
			{ staffId: '', startsOn: today, endsOn: today, reason: '' },
			zod4(dayStateClearSchema),
			{ ...options, id: 'day-state-clear' }
		)
	};
}

const success = (text: string) => ({ kind: 'success', text }) satisfies AttendanceMessage;

/**
 * The `setDayState`, `clearDayState` and `setDayPunches` actions, for a page whose actor comes from
 * `actorOf`.
 */
export function dayStateActions(actorOf: (locals: App.Locals) => Actor) {
	return {
		setDayState: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof dayStateFormSchema>, AttendanceMessage>(
				request,
				zod4(dayStateFormSchema),
				{ id: 'day-state' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				const { days } = await setDayState(actor, form.data);
				return message(form, success(m.day_state_saved({ count: days })));
			} catch (cause) {
				return failForm(form, cause);
			}
		},

		clearDayState: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof dayStateClearSchema>, AttendanceMessage>(
				request,
				zod4(dayStateClearSchema),
				{ id: 'day-state-clear' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				const { cleared } = await clearDayState(actor, form.data);
				return message(form, success(m.day_state_cleared({ count: cleared })));
			} catch (cause) {
				return failForm(form, cause);
			}
		},

		setDayPunches: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof dayPunchesSchema>, AttendanceMessage>(
				request,
				zod4(dayPunchesSchema),
				{ id: 'day-punches' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				await setDayPunches(actor, form.data);
				return message(form, success(m.day_punches_saved()));
			} catch (cause) {
				return failForm(form, cause);
			}
		}
	};
}
