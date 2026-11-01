import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	listActiveDepartments,
	listActiveTeams,
	listFunctions
} from '#lib/server/services/staff.js';
import { listStaffLists } from '#lib/server/services/staff-lists/staff-lists.bl.js';
import {
	saveListItemAction,
	setListItemActiveAction,
	staffListForm
} from '#lib/server/staff-list-forms.js';
import { createStaffAction, newStaffForm } from '#lib/server/staff-forms.js';
import type { Actions, PageServerLoad } from './$types';

// Adding an employee always opens this page (redesign plan V6); saving opens the new profile.

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const [teams, departments, functions, lists, form, listForm] = await Promise.all([
		listActiveTeams(actor),
		listActiveDepartments(actor),
		listFunctions(actor),
		listStaffLists(actor),
		newStaffForm(),
		staffListForm()
	]);
	return { teams, departments, functions, lists, form, listForm };
};

export const actions: Actions = {
	save: async ({ request, locals }) => createStaffAction(request, actorFrom(locals)),

	saveListItem: async ({ request, locals }) => saveListItemAction(request, actorFrom(locals)),

	setListItemActive: async ({ request, locals }) =>
		setListItemActiveAction(request, actorFrom(locals))
};
