import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { patternBuilderSchema } from '#lib/schemas/pattern.schema.js';
import {
	actorFrom,
	builderActions,
	builderOptions,
	prefilledTarget,
	shiftForm
} from '#lib/server/pattern-builder.js';
import { todayInDamascus } from '#lib/server/time.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	const today = todayInDamascus();
	const target = prefilledTarget(url);
	const [options, shift] = await Promise.all([builderOptions(actor), shiftForm()]);
	const work = options.shifts.find((s) => s.active)?.id ?? null;
	return {
		...options,
		today,
		canManage: actor.permissions.has('roster.manage'),
		pattern: null,
		/** Where to go back to after saving (an assign sheet's "Build a new pattern"). */
		returnTarget: target,
		form: await superValidate(
			{
				type: 'weekly',
				slots: [work, work, work, work, work, null, null],
				assign: target !== null,
				targetKind: target?.kind ?? 'team',
				targetIds: target ? [target.id] : [],
				effectiveFrom: today,
				anchorDate: today
			},
			zod4(patternBuilderSchema),
			{ id: 'builder', errors: false }
		),
		editForm: null,
		shiftForm: shift
	};
};

export const actions: Actions = builderActions;
