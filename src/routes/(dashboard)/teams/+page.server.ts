import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	createTeam,
	listTeams,
	renameTeam,
	setTeamActive
} from '#lib/server/services/teams/teams.bl.js';
import { teamName } from '#lib/utils/locale.js';
import {
	setTeamActiveSchema,
	teamFormSchema,
	type TeamMessage
} from '#lib/schemas/teams.schema.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	return {
		teams: await listTeams(actor),
		form: await superValidate(zod4(teamFormSchema), { id: 'team' })
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof teamFormSchema>, TeamMessage>(
			request,
			zod4(teamFormSchema),
			{ id: 'team' }
		);
		if (!form.valid) return fail(400, { form });

		const input = { nameEn: form.data.nameEn, nameAr: form.data.nameAr };
		try {
			const team = form.data.teamId
				? await renameTeam(actor, form.data.teamId, input)
				: await createTeam(actor, input);
			const name = teamName(team);
			return message(form, {
				kind: 'success',
				text: form.data.teamId ? m.teams_renamed({ name }) : m.teams_created({ name })
			} satisfies TeamMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	setActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setTeamActiveSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.teams_error_not_found() });

		const active = parsed.data.active === 'true';
		try {
			const team = await setTeamActive(actor, parsed.data.teamId, active);
			return {
				notice: active
					? m.teams_activated({ name: teamName(team) })
					: m.teams_deactivated({ name: teamName(team) })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
