import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { failForm } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { getShiftStarts, setShiftStarts } from '#lib/server/services/settings/settings.bl.js';
import { shiftStartsSchema, type SettingsMessage } from '#lib/schemas/settings.schema.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'settings.manage'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const shiftStarts = await getShiftStarts(actorFrom(locals));
	return {
		saved: shiftStarts !== null,
		form: await superValidate(
			shiftStarts ?? { day: '07:00', night: '19:00' },
			zod4(shiftStartsSchema),
			{
				id: 'shift-starts',
				errors: false
			}
		)
	};
};

export const actions: Actions = {
	shiftStarts: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof shiftStartsSchema>, SettingsMessage>(
			request,
			zod4(shiftStartsSchema),
			{ id: 'shift-starts' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			await setShiftStarts(actor, form.data);
			return message(form, {
				kind: 'success',
				text: m.settings_shift_starts_saved()
			} satisfies SettingsMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
