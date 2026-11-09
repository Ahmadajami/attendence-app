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
import {
	patternOnlyActions,
	patternOnlyForms,
	payRuleActions,
	payRuleForms
} from '#lib/server/pattern-pay-forms.js';
import { getPatternMonth } from '#lib/server/services/assignments/assignments.bl.js';
import { getPatternPay } from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
import { getPattern } from '#lib/server/services/patterns/patterns.bl.js';
import { todayInDamascus } from '#lib/server/time.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, untrack }) => {
	const actor = actorFrom(locals);
	if (!z.uuid().safeParse(params.id).success)
		error(404, m.patterns_error_not_found(), { code: 'not_found' });
	const today = todayInDamascus();
	// The Month tab (RO13): the load depends on `?month=` only, so switching the other tabs never
	// refetches. Opening the tab adds `month=`; a link straight to `?tab=month` gets this month.
	const month =
		url.searchParams.get('month') ??
		(untrack(() => url.searchParams.get('tab')) === 'month' ? today.slice(0, 7) : null);
	const [pattern, options, shift, pay, monthView] = await Promise.all([
		getPattern(actor, params.id),
		builderOptions(actor),
		shiftForm(),
		getPatternPay(actor, params.id),
		month === null ? Promise.resolve(null) : getPatternMonth(actor, params.id, month)
	]);
	const canManage = actor.permissions.has('roster.manage');
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
		canManage,
		pattern,
		pay,
		/** The Month tab's data; `null` until the tab is opened. */
		monthView,
		// The "Overtime & pay" and "Holidays & missions" sheets (pay plan PR12, PR36).
		payForms: canManage
			? {
					...(await payRuleForms(pattern.id, today, pay.versions)),
					...(await patternOnlyForms(pattern.id, today))
				}
			: null,
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

export const actions: Actions = {
	...builderActions,
	...payRuleActions(actorFrom),
	...patternOnlyActions(actorFrom)
};
