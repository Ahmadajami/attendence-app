import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { managerForm, setManagerAction } from '#lib/server/management-forms.js';
import { assignAction, patternForms } from '#lib/server/pattern-forms.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { currentAssignments } from '#lib/server/services/assignments/assignments.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import { listPatterns } from '#lib/server/services/patterns/patterns.bl.js';
import { todayInDamascus } from '#lib/server/time.js';
import {
	createDepartment,
	editDepartment,
	listDepartmentMembers,
	listDepartments,
	setDepartmentActive
} from '#lib/server/services/departments/departments.bl.js';
import {
	listManagerHistories,
	listManagerOptions
} from '#lib/server/services/management/management.bl.js';
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
	const today = todayInDamascus();
	const [departments, members, managers, histories, patterns, forms, managerSheetForm] =
		await Promise.all([
			listDepartments(actor),
			listDepartmentMembers(actor),
			listManagerOptions(actor),
			listManagerHistories(actor),
			listPatterns(actor),
			patternForms(today, { kind: 'department', id: '' }),
			managerForm(today)
		]);
	const assigned = await currentAssignments(
		actor,
		'department',
		departments.map((d) => d.id),
		today
	);
	return {
		departments: departments.map((d) => ({ ...d, assignment: assigned.get(d.id) ?? null })),
		/** Each department's active employees, for its people sheet. */
		members,
		managers,
		/** Each department's managers, newest first, for the change-manager sheet (M3). */
		histories,
		managerForm: managerSheetForm,
		today,
		canManage: actor.permissions.has('roster.manage'),
		/** The library, for the Default pattern column and the assign sheet. */
		patterns: patterns.map(({ id, nameEn, nameAr, type, slots, defaultWorkShiftId, active }) => ({
			id,
			nameEn,
			nameAr,
			type,
			slots,
			defaultWorkShiftId,
			active
		})),
		assignForm: forms.assignForm,
		form: await superValidate(zod4(departmentFormSchema), { id: 'department' })
	};
};

export const actions: Actions = {
	setManager: async ({ request, locals }) => setManagerAction(request, actorFrom(locals)),

	assign: async ({ request, locals }) =>
		assignAction(request, actorFrom(locals), { kind: 'department', fromForm: true }, () =>
			m.assign_saved()
		),

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
			parentId: form.data.parentId || null
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
