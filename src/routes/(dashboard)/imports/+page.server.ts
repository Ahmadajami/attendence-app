import { fail, redirect } from '@sveltejs/kit';
import { localizedHref } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';
import { AppError } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { listImportBatches, previewImport } from '#lib/server/services/imports.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = { user: requirePermission(locals, 'import.run'), permissions: locals.permissions };
	return { batches: await listImportBatches(actor) };
};

export const actions: Actions = {
	preview: async ({ request, locals }) => {
		const actor = {
			user: requirePermission(locals, 'import.run'),
			permissions: locals.permissions
		};
		const form = await request.formData();
		const kind = String(form.get('kind') ?? '');
		const file = form.get('file');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: m.imports_error_file_required() });
		}

		try {
			const preview = await previewImport(actor, kind, file);
			redirect(303, localizedHref('/imports/[id]', { id: preview.id }));
		} catch (cause) {
			if (!(cause instanceof AppError)) throw cause;
			return fail(cause.status, { error: cause.message });
		}
	}
};
