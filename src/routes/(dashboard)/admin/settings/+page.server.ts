import { payRuleActions, payRuleForms } from '#lib/server/pattern-pay-forms.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { getCompanyPay } from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
import { todayInDamascus } from '#lib/server/time.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'settings.manage'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const today = todayInDamascus();
	const pay = await getCompanyPay(actor);
	// Company overtime and holidays (pay plan PR35–PR38): changing them needs `roster.manage`.
	const canManage = actor.permissions.has('roster.manage');
	return {
		today,
		pay,
		payForms: canManage ? await payRuleForms('', today, pay.versions) : null
	};
};

export const actions: Actions = payRuleActions(actorFrom);
