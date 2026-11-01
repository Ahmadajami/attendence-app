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
import type { Actor } from '#lib/server/services/common.js';
import {
	createStaffListItem,
	setStaffListItemActive,
	updateStaffListItem
} from '#lib/server/services/staff-lists/staff-lists.bl.js';
import { lookupName } from '#lib/utils/locale.js';

// Job titles, skills, document types and custody items are managed where they are used (redesign
// plan V5, V9): the pages that pick from them load this form and mount these actions.

const id = 'staff-list';

/** The create / rename form; one per page, shared by every picker and "Manage …" sheet. */
export function staffListForm() {
	return superValidate(zod4(staffListFormSchema), { id });
}

/** Create or rename one item; the message carries the saved item so a picker can select it. */
export async function saveListItemAction(request: Request, actor: Actor) {
	const form = await superValidate<Infer<typeof staffListFormSchema>, StaffListMessage>(
		request,
		zod4(staffListFormSchema),
		{ id }
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
			text: itemId ? m.staff_lists_updated({ name }) : m.staff_lists_created({ name }),
			item
		} satisfies StaffListMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}

/** Plain action (`{ notice }`): deactivate or reactivate one item. */
export async function setListItemActiveAction(request: Request, actor: Actor) {
	const parsed = setStaffListActiveSchema.safeParse(Object.fromEntries(await request.formData()));
	if (!parsed.success) return fail(400, { notice: m.staff_lists_error_not_found() });

	const active = parsed.data.active === 'true';
	try {
		const item = await setStaffListItemActive(actor, parsed.data.kind, parsed.data.itemId, active);
		const name = lookupName(item);
		return {
			notice: active ? m.staff_lists_activated({ name }) : m.staff_lists_deactivated({ name })
		};
	} catch (cause) {
		return failNotice(cause);
	}
}
