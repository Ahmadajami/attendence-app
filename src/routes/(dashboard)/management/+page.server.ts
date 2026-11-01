import { z } from 'zod';
import { managerForm, setManagerAction } from '#lib/server/management-forms.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	getManagementTree,
	listManagerHistories,
	listManagerOptions
} from '#lib/server/services/management/management.bl.js';
import { todayInDamascus } from '#lib/server/time.js';
import type { Actions, PageServerLoad } from './$types';

// Two-level management page (plan task 4.1, M8): the tree on a date (`?on=`, default today), the
// gaps, and "change manager from a date". `staff.write` (M12).

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

const isoDate = z.iso.date();

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	const today = todayInDamascus();
	const on = url.searchParams.get('on');
	const date = on && isoDate.safeParse(on).success ? on : today;
	const [tree, people, histories, form] = await Promise.all([
		getManagementTree(actor, date),
		listManagerOptions(actor),
		listManagerHistories(actor),
		managerForm(today)
	]);
	return { date, today, tree, people, histories, managerForm: form };
};

export const actions: Actions = {
	setManager: async ({ request, locals }) => setManagerAction(request, actorFrom(locals))
};
