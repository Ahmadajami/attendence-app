import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { editFromDateSchema, patternBuilderSchema } from '#lib/schemas/pattern.schema.js';
import {
	actorFrom,
	builderActions,
	builderOptions,
	shiftForm
} from '#lib/server/pattern-builder.js';
import { getPattern } from '#lib/server/services/patterns/patterns.bl.js';
import { todayInDamascus } from '#lib/server/time.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const actor = actorFrom(locals);
	if (!z.uuid().safeParse(params.id).success)
		error(404, m.patterns_error_not_found(), { code: 'not_found' });
	const today = todayInDamascus();
	const [pattern, options, shift] = await Promise.all([
		getPattern(actor, params.id),
		builderOptions(actor),
		shiftForm()
	]);
	const fields = {
		patternId: pattern.id,
		nameEn: pattern.nameEn,
		nameAr: pattern.nameAr,
		type: pattern.type,
		slots: pattern.slots,
		defaultWorkShiftId: pattern.defaultWorkShiftId ?? ''
	};
	return {
		...options,
		today,
		canManage: actor.permissions.has('roster.manage'),
		pattern,
		returnTarget: null,
		form: await superValidate(
			{
				...fields,
				// `?step=assign` (the library card's Assign) opens step 3.
				assign: url.searchParams.get('step') === 'assign',
				effectiveFrom: today,
				anchorDate: today
			},
			zod4(patternBuilderSchema),
			{ id: 'builder', errors: false }
		),
		editForm: pattern.used
			? await superValidate(
					{
						...fields,
						nameEn: m.patterns_version_name({ name: pattern.nameEn }, { locale: 'en' }),
						nameAr: m.patterns_version_name({ name: pattern.nameAr }, { locale: 'ar' }),
						effectiveFrom: today,
						reason: ''
					},
					zod4(editFromDateSchema),
					{ id: 'edit-from-date', errors: false }
				)
			: null,
		shiftForm: shift
	};
};

export const actions: Actions = builderActions;
