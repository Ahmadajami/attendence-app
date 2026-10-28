import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { AppError } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { commitImport, getImportBatch } from '#lib/server/services/imports.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals) {
	return { user: requirePermission(locals, 'import.run'), permissions: locals.permissions };
}

// A missing batch throws `NotFoundError`; `handleError` turns it into the 404 page.
export const load: PageServerLoad = async ({ locals, params }) => ({
	batch: await getImportBatch(actorFrom(locals), params.id)
});

export const actions: Actions = {
	commit: async ({ locals, params }) => {
		try {
			const result = await commitImport(actorFrom(locals), params.id);
			return { notice: m.imports_commit_success(result) };
		} catch (cause) {
			if (!(cause instanceof AppError)) throw cause;
			return fail(cause.status, { error: cause.message });
		}
	}
};
