import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { setStaffListActiveSchema } from '#lib/schemas/staff-lists.schema.js';
import { failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	countActiveJobHolders,
	listJobs,
	setStaffListItemActive
} from '#lib/server/services/staff-lists/staff-lists.bl.js';
import { saveListItemAction, staffListForm } from '#lib/server/staff-list-forms.js';
import { lookupName } from '#lib/utils/locale.js';
import type { Actions, PageServerLoad } from './$types';

// The jobs page (plans/2026-11-09-jobs-page.md): the job titles of the employee pickers, with who
// holds each. Create / rename go through the shared staff-list form (JB8).

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const [{ jobs, holders }, listForm] = await Promise.all([listJobs(actor), staffListForm()]);
	return { jobs, holders, listForm };
};

export const actions: Actions = {
	saveListItem: async ({ request, locals }) => saveListItemAction(request, actorFrom(locals)),

	/** Like the shared `setListItemActive`, but job titles only, and the notice says how many
	 * active people keep a deactivated job (JB5). */
	setListItemActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setStaffListActiveSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success || parsed.data.kind !== 'job_title') {
			return fail(400, { notice: m.staff_lists_error_not_found() });
		}

		const active = parsed.data.active === 'true';
		try {
			const item = await setStaffListItemActive(actor, 'job_title', parsed.data.itemId, active);
			const name = lookupName(item);
			if (active) return { notice: m.staff_lists_activated({ name }) };
			const count = await countActiveJobHolders(actor, item.id);
			return {
				notice:
					count > 0 ? m.jobs_deactivated_keep({ name, count }) : m.staff_lists_deactivated({ name })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
