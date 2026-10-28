import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	setShiftActiveSchema,
	shiftFormSchema,
	type ShiftMessage
} from '#lib/schemas/shift.schema.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	createShift,
	listShiftsWithUsage,
	setShiftActive,
	updateShift
} from '#lib/server/services/shifts/shifts.bl.js';
import { lookupName } from '#lib/utils/locale.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	return {
		shifts: await listShiftsWithUsage(actor),
		canManage: actor.permissions.has('roster.manage'),
		form: await superValidate(zod4(shiftFormSchema), { id: 'shift', errors: false })
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof shiftFormSchema>, ShiftMessage>(
			request,
			zod4(shiftFormSchema),
			{ id: 'shift' }
		);
		if (!form.valid) return fail(400, { form });

		const { shiftId, ...input } = form.data;
		try {
			const row = shiftId
				? await updateShift(actor, shiftId, input)
				: await createShift(actor, input);
			const name = `${lookupName(row)} (${row.code})`;
			return message(form, {
				kind: 'success',
				text: shiftId ? m.shifts_updated({ name }) : m.shifts_created({ name })
			} satisfies ShiftMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	setActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setShiftActiveSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.shifts_error_not_found() });

		const active = parsed.data.active === 'true';
		try {
			const row = await setShiftActive(actor, parsed.data.shiftId, active);
			const name = `${lookupName(row)} (${row.code})`;
			return {
				notice: active ? m.shifts_activated({ name }) : m.shifts_deactivated({ name })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
