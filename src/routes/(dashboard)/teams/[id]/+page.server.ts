import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { punchDays } from '#lib/attendance/entry.js';
import { addDays } from '#lib/roster/cycle.js';
import { addSupervisorSchema, removeSupervisorSchema } from '#lib/schemas/roster.schema.js';
import { failNotice } from '#lib/server/errors.js';
import {
	assignAction,
	patternForms,
	resetScheduleAction,
	setScheduleAction
} from '#lib/server/pattern-forms.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { listPeopleEvents } from '#lib/server/services/attendance/attendance.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import { listPatterns } from '#lib/server/services/patterns/patterns.bl.js';
import {
	addTeamSupervisor,
	getTeamRoster,
	listCurrentMemberIds,
	listMemberSchedules,
	removeTeamSupervisor
} from '#lib/server/services/roster/roster.bl.js';
import { personName } from '#lib/utils/locale.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

function teamId(id: string): string {
	if (!z.uuid().safeParse(id).success) error(404, m.teams_error_not_found(), { code: 'not_found' });
	return id;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const actor = actorFrom(locals);
	const id = teamId(params.id);
	const roster = await getTeamRoster(actor, id, url.searchParams.get('from'));
	const [events, patterns, memberSchedules, forms] = await Promise.all([
		actor.permissions.has('attendance.record')
			? listPeopleEvents(
					actor,
					[...new Set(roster.members.map((member) => member.staffId))],
					roster.preview.from,
					addDays(roster.preview.from, roster.preview.days - 1)
				)
			: Promise.resolve([]),
		listPatterns(actor),
		listMemberSchedules(actor, id),
		patternForms(roster.today, { kind: 'team', id })
	]);
	return {
		...roster,
		/** Worked time per member and shift date: no punch details leave the server. */
		punches: punchDays(events),
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
		memberSchedules,
		...forms
	};
};

export const actions: Actions = {
	assign: async ({ request, locals, params }) =>
		assignAction(request, actorFrom(locals), { kind: 'team', id: teamId(params.id) }, () =>
			m.assign_saved()
		),

	setSchedule: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const members = await listCurrentMemberIds(actor, teamId(params.id));
		return setScheduleAction(request, actor, (staffId) => members.has(staffId));
	},

	resetSchedule: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const members = await listCurrentMemberIds(actor, teamId(params.id));
		return resetScheduleAction(request, actor, (staffId) => members.has(staffId));
	},

	addSupervisor: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const parsed = addSupervisorSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.roster_supervisor_pick() });
		try {
			const person = await addTeamSupervisor(actor, teamId(params.id), parsed.data.staffId);
			return { notice: m.roster_supervisor_added({ name: personName(person) }) };
		} catch (cause) {
			return failNotice(cause);
		}
	},

	removeSupervisor: async ({ request, locals, params }) => {
		const actor = actorFrom(locals);
		const parsed = removeSupervisorSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.roster_error_supervisor_not_found() });
		try {
			const person = await removeTeamSupervisor(actor, teamId(params.id), parsed.data.supervisorId);
			return { notice: m.roster_supervisor_removed({ name: personName(person) }) };
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
