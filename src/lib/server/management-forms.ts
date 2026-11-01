import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer, type SuperValidated } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	departmentManagerFormSchema,
	type DepartmentManagerMessage
} from '#lib/schemas/management.schema.js';
import { failForm } from '#lib/server/errors.js';
import type { Actor } from '#lib/server/services/common.js';
import { setDepartmentManager } from '#lib/server/services/management/management.bl.js';

// The "change manager from a date" form (two-level plan 4.1, 4.2), shared by `/management` and
// `/departments`: each page loads the empty form and calls `setManagerAction` from its action.

const id = 'department-manager';

/** The empty form, starting today. The sheet fills the department when it opens. */
export async function managerForm(today: string) {
	return superValidate(
		{ departmentId: undefined, staffId: '', validFrom: today, reason: '' },
		zod4(departmentManagerFormSchema),
		{ id, errors: false }
	);
}

export async function setManagerAction(request: Request, actor: Actor) {
	const form: SuperValidated<
		Infer<typeof departmentManagerFormSchema>,
		DepartmentManagerMessage
	> = await superValidate(request, zod4(departmentManagerFormSchema), { id });
	if (!form.valid) return fail(400, { form });
	try {
		await setDepartmentManager(actor, {
			departmentId: form.data.departmentId,
			staffId: form.data.staffId || null,
			validFrom: form.data.validFrom,
			reason: form.data.reason
		});
		return message(form, {
			kind: 'success',
			text: m.management_manager_saved()
		} satisfies DepartmentManagerMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}
