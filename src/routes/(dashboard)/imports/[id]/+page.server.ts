import { m } from '#lib/paraglide/messages.js';
import { failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import {
	PUNCH_FILTERS,
	commitImport,
	getImportBatch,
	getImportBatchKind,
	getPunchBatchPage,
	getRosterBatchView,
	undoImport,
	type PunchFilter
} from '#lib/server/services/imports.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals) {
	return { user: requirePermission(locals, 'import.run'), permissions: locals.permissions };
}

function filterOf(value: string | null): PunchFilter {
	return (PUNCH_FILTERS as readonly string[]).includes(value ?? '')
		? (value as PunchFilter)
		: 'all';
}

// A missing batch throws `NotFoundError`; `handleError` turns it into the 404 page.
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const actor = actorFrom(locals);
	const kind = await getImportBatchKind(actor, params.id);
	if (kind === 'punches') {
		const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
		return {
			kind,
			view: await getPunchBatchPage(
				actor,
				params.id,
				filterOf(url.searchParams.get('show')),
				Number.isFinite(page) ? page : 1,
				url.searchParams.get('employee') ?? ''
			)
		};
	}
	if (kind === 'shifts' || kind === 'roster')
		return { kind, roster: await getRosterBatchView(actor, params.id) };
	return { kind, batch: await getImportBatch(actor, params.id) };
};

export const actions: Actions = {
	commit: async ({ locals, params }) => {
		try {
			const result = await commitImport(actorFrom(locals), params.id);
			return {
				notice:
					result.kind === 'punches'
						? m.imports_punch_commit_success(result)
						: result.kind === 'shifts'
							? m.imports_shift_commit_success(result)
							: result.kind === 'roster'
								? m.imports_roster_commit_success(result)
								: m.imports_commit_success(result)
			};
		} catch (cause) {
			return failNotice(cause);
		}
	},
	undo: async ({ locals, params }) => {
		try {
			await undoImport(actorFrom(locals), params.id);
			return { notice: m.imports_undo_success() };
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
