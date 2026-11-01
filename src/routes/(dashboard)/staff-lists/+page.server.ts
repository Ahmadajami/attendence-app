import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	setStaffListActiveSchema,
	staffListFormSchema,
	type StaffListMessage
} from '#lib/schemas/staff-lists.schema.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	createStaffListItem,
	listStaffLists,
	setStaffListItemActive,
	updateStaffListItem
} from '#lib/server/services/staff-lists/staff-lists.bl.js';
import { lookupName } from '#lib/utils/locale.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	return {
		...(await listStaffLists(actor)),
		form: await superValidate(zod4(staffListFormSchema), { id: 'staff-list' })
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof staffListFormSchema>, StaffListMessage>(
			request,
			zod4(staffListFormSchema),
			{ id: 'staff-list' }
		);
		if (!form.valid) return fail(400, { form });

		const { kind, itemId, nameEn, nameAr, required } = form.data;
		try {
			const item = itemId
				? await updateStaffListItem(actor, kind, itemId, { nameEn, nameAr, required })
				: await createStaffListItem(actor, kind, { nameEn, nameAr, required });
			const name = lookupName(item);
			return message(form, {
				kind: 'success',
				text: itemId ? m.staff_lists_updated({ name }) : m.staff_lists_created({ name })
			} satisfies StaffListMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	setActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setStaffListActiveSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.staff_lists_error_not_found() });

		const active = parsed.data.active === 'true';
		try {
			const item = await setStaffListItemActive(
				actor,
				parsed.data.kind,
				parsed.data.itemId,
				active
			);
			const name = lookupName(item);
			return {
				notice: active ? m.staff_lists_activated({ name }) : m.staff_lists_deactivated({ name })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
