import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { listPersonalPatternStaff } from '#lib/server/services/roster/roster.bl.js';
import {
	listActiveTeams,
	listStaff,
	setStaffActive,
	setStaffTeam
} from '#lib/server/services/staff.js';
import { personName, teamName } from '#lib/utils/locale.js';
import { setStaffActiveSchema, setStaffTeamSchema } from '#lib/schemas/staff.schema.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const [staff, teams, personalPatternIds] = await Promise.all([
		listStaff(actor),
		listActiveTeams(actor),
		listPersonalPatternStaff(actor)
	]);
	return { employees: staff, teams, personalPatternIds };
};

export const actions: Actions = {
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
					: m.employees_deactivated({ name: personName(row) })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
