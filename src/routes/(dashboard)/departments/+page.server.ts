import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	createDepartment,
	editDepartment,
	listDepartments,
	listManagerOptions,
	setDepartmentActive
} from '#lib/server/services/departments/departments.bl.js';
import { teamName } from '#lib/utils/locale.js';
import {
	departmentFormSchema,
	setDepartmentActiveSchema,
	type DepartmentMessage
} from '#lib/schemas/departments.schema.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const [departments, managers] = await Promise.all([
		listDepartments(actor),
		listManagerOptions(actor)
	]);
	return {
		departments,
		managers,
		form: await superValidate(zod4(departmentFormSchema), { id: 'department' })
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof departmentFormSchema>, DepartmentMessage>(
			request,
			zod4(departmentFormSchema),
			{ id: 'department' }
		);
		if (!form.valid) return fail(400, { form });

		const input = {
			nameEn: form.data.nameEn,
			nameAr: form.data.nameAr,
			parentId: form.data.parentId || null,
			managerStaffId: form.data.managerStaffId || null
		};
		try {
			const row = form.data.departmentId
				? await editDepartment(actor, form.data.departmentId, input)
				: await createDepartment(actor, input);
			const name = teamName(row);
			return message(form, {
				kind: 'success',
				text: form.data.departmentId
					? m.departments_updated({ name })
					: m.departments_created({ name })
			} satisfies DepartmentMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	setActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setDepartmentActiveSchema.safeParse(
			Object.fromEntries(await request.formData())
		);
		if (!parsed.success) return fail(400, { notice: m.departments_error_not_found() });

		const active = parsed.data.active === 'true';
		try {
			const row = await setDepartmentActive(actor, parsed.data.departmentId, active);
			return {
				notice: active
					? m.departments_activated({ name: teamName(row) })
					: m.departments_deactivated({ name: teamName(row) })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
