import { fail } from '@sveltejs/kit';
import { message, setError, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { entrySheetSchema, type AttendanceMessage } from '#lib/schemas/attendance.schema.js';
import { recomputeFromSchema } from '#lib/schemas/day-results.schema.js';
import { failForm } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import {
	EntrySheetError,
	getEntrySheet,
	saveEntrySheet,
	type EntryScope
} from '#lib/server/services/attendance/attendance.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	MAX_BACKFILL_DAYS,
	recomputeFrom
} from '#lib/server/services/day-results/day-results.bl.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'attendance.record'), permissions: locals.permissions };
}

/** `?scope=department:<id>` / `?scope=team:<id>` (the filter form), else no scope yet. */
function scopeFrom(url: URL): EntryScope {
	const [kind, id] = (url.searchParams.get('scope') ?? '').split(':');
	if (!z.uuid().safeParse(id).success) return null;
	if (kind === 'department') return { departmentId: id };
	if (kind === 'team') return { teamId: id };
	return null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	const sheet = await getEntrySheet(actor, url.searchParams.get('date'), scopeFrom(url));
	// "Recompute from a date" (pay plan 3.3) lives here until the daily page (5.2) takes it over.
	const canRecompute = actor.permissions.has('roster.manage');
	return {
		sheet,
		canRecompute,
		maxRecomputeDays: MAX_BACKFILL_DAYS,
		recomputeForm: canRecompute
			? await superValidate({ from: sheet.shiftDate }, zod4(recomputeFromSchema), {
					id: 'recompute',
					errors: false
				})
			: null,
		form: await superValidate(
			{
				shiftDate: sheet.shiftDate,
				rows: sheet.rows.map(({ person, day }) => ({
					staffId: person.staffId,
					shiftId: day.shiftId ?? '',
					checkIn: '',
					checkOut: '',
					absence: '' as const,
					reason: ''
				}))
			},
			zod4(entrySheetSchema),
			{ id: 'entry', errors: false }
		)
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof entrySheetSchema>, AttendanceMessage>(
			request,
			zod4(entrySheetSchema),
			{ id: 'entry' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			const saved = await saveEntrySheet(actor, form.data);
			return message(form, {
				kind: 'success',
				text: m.attendance_saved({ events: saved.events, absences: saved.absences })
			} satisfies AttendanceMessage);
		} catch (cause) {
			if (cause instanceof EntrySheetError) {
				for (const issue of cause.issues)
					setError(form, `rows[${issue.index}].${issue.field}`, issue.message);
				return message(form, { kind: 'error', text: cause.message } satisfies AttendanceMessage, {
					status: 400
				});
			}
			return failForm(form, cause);
		}
	},

	recompute: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof recomputeFromSchema>, AttendanceMessage>(
			request,
			zod4(recomputeFromSchema),
			{ id: 'recompute' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			const result = await recomputeFrom(actor, form.data.from);
			return message(form, {
				kind: 'success',
				text: m.daily_recompute_done(result)
			} satisfies AttendanceMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
