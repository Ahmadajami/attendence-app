import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { personSearch } from '#lib/attendance/person-search.js';
import { m } from '#lib/paraglide/messages.js';
import type { AttendanceMessage } from '#lib/schemas/attendance.schema.js';
import {
	DAILY_SOURCES,
	recomputeDaysSchema,
	recomputeFromSchema,
	type DailySource
} from '#lib/schemas/day-results.schema.js';
import { DAY_STATUSES, type DayStatus } from '#lib/schemas/enums.js';
import { dayStateActions, dayStateForms } from '#lib/server/day-state-forms.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	getDailyAttendance,
	parseScope,
	recomputeDailyScope
} from '#lib/server/services/daily/daily.bl.js';
import {
	catchUpFlagged,
	MAX_BACKFILL_DAYS,
	recomputeFrom
} from '#lib/server/services/day-results/day-results.bl.js';
import type { Actions, PageServerLoad } from './$types';

// The daily attendance page (pay plan PR20, task 5.2): the stored records of one date and scope,
// the day editor and history per row, Recompute for the shown date and scope, and "Recompute from
// a date" (the backfill, task 3.3). Viewing needs `staff.write` (PR13).

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | null =>
	values.includes(value as T) ? (value as T) : null;

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	// Flagged rows (a recompute that failed after its write) are repaired before they are shown.
	await catchUpFlagged();
	const page = await getDailyAttendance(actor, {
		from: url.searchParams.get('from'),
		to: url.searchParams.get('to'),
		scope: parseScope(url.searchParams.get('scope')),
		status: oneOf<DayStatus>(DAY_STATUSES, url.searchParams.get('status')),
		source: oneOf<DailySource>(DAILY_SOURCES, url.searchParams.get('source')),
		q: personSearch(url.searchParams.get('q'))
	});
	const canRecord = actor.permissions.has('attendance.record');
	const canBackfill = actor.permissions.has('roster.manage');
	return {
		page,
		canRecord,
		dayStateForms: canRecord ? await dayStateForms(page.to) : null,
		maxRecomputeDays: MAX_BACKFILL_DAYS,
		recomputeForm: canBackfill
			? await superValidate({ from: page.from }, zod4(recomputeFromSchema), {
					id: 'recompute',
					errors: false
				})
			: null
	};
};

export const actions: Actions = {
	...dayStateActions(actorFrom),

	/** Plain action (`{ notice }`): Recompute for the shown range, scope and person search. */
	recomputeDays: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = recomputeDaysSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.roster_date_invalid() });
		try {
			const result = await recomputeDailyScope(
				actor,
				parsed.data.from,
				parsed.data.to,
				parseScope(parsed.data.scope),
				personSearch(parsed.data.q)
			);
			return { notice: m.daily_recompute_days_done(result) };
		} catch (cause) {
			return failNotice(cause);
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
