import { fail, type RequestEvent } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	attendanceRuleFormSchema,
	type ROUNDING_STEP_CHOICES
} from '#lib/schemas/attendance-rules.schema.js';
import { payRuleActions, payRuleForms } from '#lib/server/pattern-pay-forms.js';
import { failForm } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	getAttendanceRules,
	setAttendanceRule
} from '#lib/server/services/attendance-rules/attendance-rules.bl.js';
import { getCompanyPay } from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
import { todayInDamascus } from '#lib/server/time.js';
import type { StatusMessage } from '#lib/utils/form-toasts.js';
import type { Actions, PageServerLoad } from './$types';

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'settings.manage'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const today = todayInDamascus();
	const pay = await getCompanyPay(actor);
	const attendance = await getAttendanceRules(actor);
	// Company overtime and holidays (pay plan PR35–PR38): changing them needs `roster.manage`.
	const canManage = actor.permissions.has('roster.manage');
	const current = attendance.today.rules;
	return {
		today,
		pay,
		payForms: canManage ? await payRuleForms('', today, pay.versions) : null,
		attendance: { versions: attendance.versions, today: attendance.today },
		// The form starts from the rules in force today, applying from today.
		attendanceForm: canManage
			? await superValidate(
					{
						effectiveFrom: today,
						overtimeStep: String(current.overtimeStep) as (typeof ROUNDING_STEP_CHOICES)[number],
						overtimeMode: current.overtimeMode,
						fridayPrayerOn: current.fridayPrayerOn,
						fridayPrayerMinutes: current.fridayPrayerMinutes,
						fridayPrayerSegments: current.fridayPrayerSegments,
						reason: ''
					},
					zod4(attendanceRuleFormSchema),
					{ errors: false, id: 'attendance-rules' }
				)
			: null
	};
};

export const actions: Actions = {
	...payRuleActions(actorFrom),
	setAttendanceRule: async ({ request, locals }: RequestEvent) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof attendanceRuleFormSchema>, StatusMessage>(
			request,
			zod4(attendanceRuleFormSchema),
			{ id: 'attendance-rules' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			await setAttendanceRule(actor, form.data);
			return message(form, {
				kind: 'success',
				text: m.attendance_rules_saved({ date: form.data.effectiveFrom })
			});
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
