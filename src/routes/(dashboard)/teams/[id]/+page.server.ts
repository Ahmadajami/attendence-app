import { error, fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { patternOn } from '#lib/roster/roster.js';
import {
	addSupervisorSchema,
	patternFormSchema,
	removeSupervisorSchema,
	type RosterMessage
} from '#lib/schemas/roster.schema.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	addTeamSupervisor,
	getTeamRoster,
	removeTeamSupervisor,
	setTeamPattern
} from '#lib/server/services/roster/roster.bl.js';
import { personName, teamName } from '#lib/utils/locale.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

function teamId(id: string): string {
	if (!z.uuid().safeParse(id).success) error(404, m.teams_error_not_found(), { code: 'not_found' });
	return id;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const roster = await getTeamRoster(
		actorFrom(locals),
		teamId(params.id),
		url.searchParams.get('from')
	);
	const current = patternOn(roster.versions, roster.today) ?? roster.versions.at(-1);
	return {
		...roster,
		patternForm: await superValidate(
			{
				cycle: current?.cycle ?? ['day', 'night', 'off', 'off'],
				anchorDate: current?.anchorDate ?? roster.today,
				effectiveFrom: roster.today,
				reason: ''
			},
			zod4(patternFormSchema),
			{ id: 'pattern', errors: false }
		)
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
			const team = await setTeamPattern(actor, teamId(params.id), form.data);
			return message(form, {
				kind: 'success',
				text: m.roster_pattern_saved({ name: teamName(team) })
			} satisfies RosterMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
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
