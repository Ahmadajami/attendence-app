import { fail, type RequestEvent } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { versionOn } from '#lib/payroll/pay-rule.js';
import {
	holidayCancelSchema,
	holidayExceptionSchema,
	holidayFormSchema,
	missionCancelSchema,
	missionFormSchema,
	payRuleFormSchema,
	payRuleResetSchema,
	type OtChoice,
	type PatternPayMessage
} from '#lib/schemas/pattern-pay.schema.js';
import { failForm } from '#lib/server/errors.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	addHoliday,
	addMission,
	cancelHoliday,
	cancelMission,
	resetPayRule,
	setHolidayException,
	setPayRule
} from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
import type { PayRuleRow } from '#lib/server/services/pattern-pay/pattern-pay.crud.js';

// The pay rule and holiday sheets (pay plan PR12, PR35–PR38), shared by `/patterns/[id]` (a
// pattern's tabs) and `/admin/settings` (the company: `patternId` ''). The services check
// `roster.manage` on every write.

const options = { errors: false } as const;

const choice = (value: boolean | null): OtChoice =>
	value === null ? 'inherit' : value ? 'on' : 'off';

/** The pay rule and holiday sheets of `owner` (a pattern id, or `''` for the company). */
export async function payRuleForms(owner: string, today: string, versions: readonly PayRuleRow[]) {
	// The rule sheet starts from the owner's version in force today (empty = inherit).
	const current = versionOn(versions, today);
	return {
		rule: await superValidate(
			{
				patternId: owner,
				otEnabled: choice(current?.otEnabled ?? null),
				workDayRate: current?.workDayRate ?? null,
				offDayRate: current?.offDayRate ?? null,
				holidayRate: current?.holidayRate ?? null,
				effectiveFrom: today,
				reason: ''
			},
			zod4(payRuleFormSchema),
			{ ...options, id: 'pay-rule' }
		),
		reset: await superValidate(
			{ patternId: owner, effectiveFrom: today, reason: '' },
			zod4(payRuleResetSchema),
			{ ...options, id: 'pay-reset' }
		),
		holiday: await superValidate(
			{
				patternId: owner,
				startsOn: today,
				endsOn: today,
				nameEn: '',
				nameAr: '',
				otEligible: false,
				reason: ''
			},
			zod4(holidayFormSchema),
			{ ...options, id: 'holiday' }
		),
		holidayCancel: await superValidate(zod4(holidayCancelSchema), {
			...options,
			id: 'holiday-cancel'
		})
	};
}

/** A pattern's extra sheets: missions and its exceptions to company holidays. */
export async function patternOnlyForms(patternId: string, today: string) {
	return {
		mission: await superValidate(
			{ patternId, startsOn: today, endsOn: today, staffIds: [], reason: '' },
			zod4(missionFormSchema),
			{ ...options, id: 'mission' }
		),
		missionCancel: await superValidate(zod4(missionCancelSchema), {
			...options,
			id: 'mission-cancel'
		}),
		exception: await superValidate(
			{ patternId, applies: true, otEligible: 'inherit' as const, reason: '' },
			zod4(holidayExceptionSchema),
			{ ...options, id: 'holiday-exception' }
		)
	};
}

const success = (text: string) => ({ kind: 'success', text }) satisfies PatternPayMessage;

type ActorOf = (locals: App.Locals) => Actor;

/** The pay rule and holiday actions, for a page whose actor comes from `actorOf`. */
export function payRuleActions(actorOf: ActorOf) {
	return {
		setPayRule: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof payRuleFormSchema>, PatternPayMessage>(
				request,
				zod4(payRuleFormSchema),
				{ id: 'pay-rule' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				await setPayRule(actor, form.data);
				return message(form, success(m.pattern_pay_saved({ date: form.data.effectiveFrom })));
			} catch (cause) {
				return failForm(form, cause);
			}
		},

		resetPayRule: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof payRuleResetSchema>, PatternPayMessage>(
				request,
				zod4(payRuleResetSchema),
				{ id: 'pay-reset' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				await resetPayRule(actor, form.data);
				return message(form, success(m.pattern_pay_reset_saved({ date: form.data.effectiveFrom })));
			} catch (cause) {
				return failForm(form, cause);
			}
		},

		addHoliday: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof holidayFormSchema>, PatternPayMessage>(
				request,
				zod4(holidayFormSchema),
				{ id: 'holiday' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				await addHoliday(actor, form.data);
				return message(form, success(m.pattern_holiday_added()));
			} catch (cause) {
				return failForm(form, cause);
			}
		},

		cancelHoliday: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof holidayCancelSchema>, PatternPayMessage>(
				request,
				zod4(holidayCancelSchema),
				{ id: 'holiday-cancel' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				await cancelHoliday(actor, form.data);
				return message(form, success(m.pattern_holiday_cancelled()));
			} catch (cause) {
				return failForm(form, cause);
			}
		}
	};
}

/** A pattern's extra actions: missions and its exceptions to company holidays. */
export function patternOnlyActions(actorOf: ActorOf) {
	return {
		addMission: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof missionFormSchema>, PatternPayMessage>(
				request,
				zod4(missionFormSchema),
				{ id: 'mission' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				const { members } = await addMission(actor, form.data);
				return message(form, success(m.pattern_mission_added({ count: members })));
			} catch (cause) {
				return failForm(form, cause);
			}
		},

		cancelMission: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof missionCancelSchema>, PatternPayMessage>(
				request,
				zod4(missionCancelSchema),
				{ id: 'mission-cancel' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				const { members } = await cancelMission(actor, form.data);
				return message(form, success(m.pattern_mission_cancelled({ count: members })));
			} catch (cause) {
				return failForm(form, cause);
			}
		},

		setHolidayException: async ({ request, locals }: RequestEvent) => {
			const actor = actorOf(locals);
			const form = await superValidate<Infer<typeof holidayExceptionSchema>, PatternPayMessage>(
				request,
				zod4(holidayExceptionSchema),
				{ id: 'holiday-exception' }
			);
			if (!form.valid) return fail(400, { form });
			try {
				await setHolidayException(actor, form.data);
				return message(form, success(m.pattern_holiday_exception_saved()));
			} catch (cause) {
				return failForm(form, cause);
			}
		}
	};
}
