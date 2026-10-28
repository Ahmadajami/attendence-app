import { error, fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { patternFormDefaults } from '#lib/app/roster/preview.js';
import { m } from '#lib/paraglide/messages.js';
import { addDays } from '#lib/roster/cycle.js';
import { patternOn } from '#lib/roster/roster.js';
import {
	addPairSchema,
	correctionSchema,
	type AttendanceMessage
} from '#lib/schemas/attendance.schema.js';
import {
	endPatternFormSchema,
	patternFormSchema,
	type RosterMessage
} from '#lib/schemas/roster.schema.js';
import { failForm } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import {
	addPair,
	correctEvent,
	listPersonEvents
} from '#lib/server/services/attendance/attendance.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	endPersonalPattern,
	getPersonRoster,
	setPersonalPattern
} from '#lib/server/services/roster/roster.bl.js';
import { personName } from '#lib/utils/locale.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

function staffId(id: string): string {
	if (!z.uuid().safeParse(id).success) error(404, m.staff_error_not_found(), { code: 'not_found' });
	return id;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const roster = await getPersonRoster(
		actorFrom(locals),
		staffId(params.id),
		url.searchParams.get('from')
	);
	const current = patternOn(roster.versions, roster.today) ?? roster.versions.at(-1);
	const actor = actorFrom(locals);
	const canRecord = actor.permissions.has('attendance.record');
	const last = addDays(roster.preview.from, roster.preview.days - 1);
	/** `?day=` opens the day panel when it is inside the preview window. */
	const day = url.searchParams.get('day');
	const [events, patternForm, endForm] = await Promise.all([
		canRecord
			? listPersonEvents(actor, roster.person.staffId, roster.preview.from, last)
			: Promise.resolve([]),
		superValidate(
			patternFormDefaults(current, roster.today, roster.preview.shifts),
			zod4(patternFormSchema),
			{ id: 'pattern', errors: false }
		),
		superValidate({ effectiveFrom: roster.today, reason: '' }, zod4(endPatternFormSchema), {
			id: 'end-pattern',
			errors: false
		})
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
		patternForm,
		endForm
	};
};

export const actions: Actions = {
	savePattern: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof patternFormSchema>, RosterMessage>(
			request,
			zod4(patternFormSchema),
			{ id: 'pattern' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			const person = await setPersonalPattern(actor, staffId(params.id), form.data);
			return message(form, {
				kind: 'success',
				text: m.roster_pattern_saved({ name: personName(person) })
			} satisfies RosterMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

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
	},

	endPattern: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof endPatternFormSchema>, RosterMessage>(
			request,
			zod4(endPatternFormSchema),
			{ id: 'end-pattern' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			const person = await endPersonalPattern(actor, staffId(params.id), form.data);
			return message(form, {
				kind: 'success',
				text: m.roster_pattern_ended({ name: personName(person) })
			} satisfies RosterMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
