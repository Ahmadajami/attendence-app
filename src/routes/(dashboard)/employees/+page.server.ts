import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { listPersonalPatternStaff } from '#lib/server/services/roster/roster.bl.js';
import {
	createStaff,
	listActiveTeams,
	listFunctions,
	listStaff,
	setStaffActive,
	setStaffTeam,
	updateStaff
} from '#lib/server/services/staff.js';
import { personName, teamName } from '#lib/utils/locale.js';
import {
	setStaffActiveSchema,
	setStaffTeamSchema,
	staffFormSchema,
	type StaffMessage
} from './schema.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const [staff, teams, functions, personalPatternIds] = await Promise.all([
		listStaff(actor),
		listActiveTeams(actor),
		listFunctions(actor),
		listPersonalPatternStaff(actor)
	]);
	return {
		employees: staff,
		teams,
		functions,
		personalPatternIds,
		form: await superValidate(zod4(staffFormSchema), { id: 'staff' })
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof staffFormSchema>, StaffMessage>(
			request,
			zod4(staffFormSchema),
			{ id: 'staff' }
		);
		if (!form.valid) return fail(400, { form });

		const input = {
			employeeNo: form.data.employeeNo,
			fullName: form.data.fullName,
			fullNameAr: form.data.fullNameAr || null,
			phone: form.data.phone || null,
			functionId: form.data.functionId,
			teamId: form.data.teamId || null
		};

		try {
			const row = form.data.staffId
				? await updateStaff(actor, form.data.staffId, input)
				: await createStaff(actor, input);
			return message(form, {
				kind: 'success',
				text: form.data.staffId
					? m.staff_updated({ name: personName(row) })
					: m.staff_created({ name: personName(row) })
			} satisfies StaffMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	/** Drag-and-drop target: `teamId` empty removes the employee from their team. */
	setTeam: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setStaffTeamSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.staff_error_not_found() });

		try {
			const row = await setStaffTeam(actor, parsed.data.staffId, parsed.data.teamId || null);
			return {
				notice: row.team
					? m.employees_moved({ name: personName(row), team: teamName(row.team) })
					: m.employees_removed({ name: personName(row) })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	},

	setActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setStaffActiveSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.staff_error_not_found() });

		const active = parsed.data.active === 'true';
		try {
			const row = await setStaffActive(actor, parsed.data.staffId, active);
			return {
				notice: active
					? m.staff_activated({ name: personName(row) })
					: m.staff_deactivated({ name: personName(row) })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
