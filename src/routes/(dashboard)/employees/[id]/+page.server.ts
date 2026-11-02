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
import { setStaffActiveSchema } from '#lib/schemas/staff.schema.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import {
	assignAction,
	endAssignmentAction,
	patternForms,
	resetScheduleAction,
	setScheduleAction
} from '#lib/server/pattern-forms.js';
import {
	contactAction,
	custodyAction,
	documentAction,
	experienceAction,
	identityAction,
	namesAction,
	profileForms,
	removeItemAction,
	skillAction,
	socialAction
} from '#lib/server/profile-forms.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import {
	addPair,
	correctEvent,
	listPersonEvents
} from '#lib/server/services/attendance/attendance.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import { managementTreeFor } from '#lib/server/services/management/management.bl.js';
import { listPatterns } from '#lib/server/services/patterns/patterns.bl.js';
import { getPersonRoster, getPersonSchedule } from '#lib/server/services/roster/roster.bl.js';
import {
	listActiveDepartments,
	listActiveTeams,
	listFunctions,
	setStaffActive
} from '#lib/server/services/staff.js';
import { getStaffProfile } from '#lib/server/services/staff-profile/staff-profile.bl.js';
import { editStaffForm, updateStaffAction } from '#lib/server/staff-forms.js';
import {
	saveListItemAction,
	setListItemActiveAction,
	staffListForm
} from '#lib/server/staff-list-forms.js';
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
	const actor = actorFrom(locals);
	const id = staffId(params.id);
	const roster = await getPersonRoster(actor, id, url.searchParams.get('from'));
	const canRecord = actor.permissions.has('attendance.record');
	const last = addDays(roster.preview.from, roster.preview.days - 1);
	/** `?day=` opens the day panel when it is inside the preview window. */
	const day = url.searchParams.get('day');
	/** `?on=`: the Management tab's date (tree plan M15); only this param reruns the load for it. */
	const on = url.searchParams.get('on');
	const managementDate = on && z.iso.date().safeParse(on).success ? on : roster.today;
	const [
		events,
		schedule,
		patterns,
		forms,
		profile,
		teams,
		departments,
		functions,
		listForm,
		management
	] = await Promise.all([
		canRecord
			? listPersonEvents(actor, roster.person.staffId, roster.preview.from, last)
			: Promise.resolve([]),
		getPersonSchedule(actor, id),
		listPatterns(actor),
		patternForms(roster.today, { kind: 'staff', id }),
		getStaffProfile(actor, id),
		listActiveTeams(actor),
		listActiveDepartments(actor),
		listFunctions(actor),
		staffListForm(),
		managementTreeFor(actor, id, managementDate)
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
		...forms,
		profile,
		/** The four lists, for the pickers and the "Manage …" sheets (V5). */
		lists: profile.lists,
		teams,
		departments,
		functions,
		listForm,
		/** The Management tab (tree plan M15–M20). */
		management,
		staffEditForm: await editStaffForm(profile.person),
		...(await profileForms(profile.person))
	};
};

export const actions: Actions = {
	saveStaff: async ({ request, locals, params }) =>
		updateStaffAction(request, actorFrom(locals), staffId(params.id)),

	/** Plain action (`{ notice }`): the header's Deactivate / Activate. */
	setActive: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const id = staffId(params.id);
		const parsed = setStaffActiveSchema
			.pick({ active: true })
			.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.staff_error_not_found() });

		const active = parsed.data.active === 'true';
		try {
			const row = await setStaffActive(actor, id, active);
			return {
				notice: active
					? m.staff_activated({ name: personName(row) })
					: m.staff_deactivated({ name: personName(row) })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	},

	saveListItem: async ({ request, locals }) => saveListItemAction(request, actorFrom(locals)),

	setListItemActive: async ({ request, locals }) =>
		setListItemActiveAction(request, actorFrom(locals)),

	saveNames: async ({ request, locals, params }) =>
		namesAction(request, actorFrom(locals), staffId(params.id)),

	saveIdentity: async ({ request, locals, params }) =>
		identityAction(request, actorFrom(locals), staffId(params.id)),

	saveContact: async ({ request, locals, params }) =>
		contactAction(request, actorFrom(locals), staffId(params.id)),

	saveExperience: async ({ request, locals, params }) =>
		experienceAction(request, actorFrom(locals), staffId(params.id)),

	saveSkill: async ({ request, locals, params }) =>
		skillAction(request, actorFrom(locals), staffId(params.id)),

	saveSocial: async ({ request, locals, params }) =>
		socialAction(request, actorFrom(locals), staffId(params.id)),

	setDocument: async ({ request, locals, params }) =>
		documentAction(request, actorFrom(locals), staffId(params.id)),

	saveCustody: async ({ request, locals, params }) =>
		custodyAction(request, actorFrom(locals), staffId(params.id)),

	removeProfileItem: async ({ request, locals, params }) =>
		removeItemAction(request, actorFrom(locals), staffId(params.id)),

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
				text: form.data.voidEvent ? m.attendance_removed_saved() : m.attendance_corrected_saved()
			} satisfies AttendanceMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
