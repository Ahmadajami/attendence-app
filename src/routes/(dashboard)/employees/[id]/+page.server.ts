import { error, fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { addDays } from '#lib/roster/cycle.js';
import {
	addPairSchema,
	correctionSchema,
	type AttendanceMessage
} from '#lib/schemas/attendance.schema.js';
import { failForm } from '#lib/server/errors.js';
import {
	assignAction,
	endAssignmentAction,
	patternForms,
	resetScheduleAction,
	setScheduleAction
} from '#lib/server/pattern-forms.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import {
	addPair,
	correctEvent,
	listPersonEvents
} from '#lib/server/services/attendance/attendance.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import { listPatterns } from '#lib/server/services/patterns/patterns.bl.js';
import { getPersonRoster, getPersonSchedule } from '#lib/server/services/roster/roster.bl.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

function staffId(id: string): string {
	if (!z.uuid().safeParse(id).success) error(404, m.staff_error_not_found(), { code: 'not_found' });
	return id;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const actor = actorFrom(locals);
	const id = staffId(params.id);
	const roster = await getPersonRoster(actor, id, url.searchParams.get('from'));
	const canRecord = actor.permissions.has('attendance.record');
	const last = addDays(roster.preview.from, roster.preview.days - 1);
	/** `?day=` opens the day panel when it is inside the preview window. */
	const day = url.searchParams.get('day');
	const [events, schedule, patterns, forms] = await Promise.all([
		canRecord
			? listPersonEvents(actor, roster.person.staffId, roster.preview.from, last)
			: Promise.resolve([]),
		getPersonSchedule(actor, id),
		listPatterns(actor),
		patternForms(roster.today, { kind: 'staff', id })
	]);
	return {
		...roster,
		canRecord,
		events,
		selectedDay: day && day >= roster.preview.from && day <= last ? day : null,
		/** A personal version in force today or scheduled: the person doesn't follow their team. */
		hasPersonalPattern: roster.versions.some(
			(v) => v.effectiveTo === null || v.effectiveTo > roster.today
		),
		schedule,
		/** The library, for pattern names and the assign sheet. */
		patterns: patterns.map(({ id, nameEn, nameAr, type, slots, defaultWorkShiftId, active }) => ({
			id,
			nameEn,
			nameAr,
			type,
			slots,
			defaultWorkShiftId,
			active
		})),
		...forms
	};
};

export const actions: Actions = {
	assign: async ({ request, locals, params }) =>
		assignAction(request, actorFrom(locals), { kind: 'staff', id: staffId(params.id) }, () =>
			m.assign_saved()
		),

	endAssignment: async ({ request, locals, params }) =>
		endAssignmentAction(request, actorFrom(locals), { kind: 'staff', id: staffId(params.id) }, () =>
			m.assign_ended()
		),

	setSchedule: async ({ request, locals, params }) =>
		setScheduleAction(request, actorFrom(locals), (id) => id === staffId(params.id)),

	resetSchedule: async ({ request, locals, params }) =>
		resetScheduleAction(request, actorFrom(locals), (id) => id === staffId(params.id)),

	addPair: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof addPairSchema>, AttendanceMessage>(
			request,
			zod4(addPairSchema)
		);
		if (!form.valid) return fail(400, { form });
		try {
			await addPair(actor, { ...form.data, staffId: staffId(params.id) });
			return message(form, {
				kind: 'success',
				text: m.attendance_pair_saved()
			} satisfies AttendanceMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	correctEvent: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof correctionSchema>, AttendanceMessage>(
			request,
			zod4(correctionSchema)
		);
		if (!form.valid) return fail(400, { form });
		try {
			await correctEvent(actor, form.data);
			return message(form, {
				kind: 'success',
				text: form.data.remove ? m.attendance_removed_saved() : m.attendance_corrected_saved()
			} satisfies AttendanceMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
