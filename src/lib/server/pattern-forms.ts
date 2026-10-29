import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer, type SuperValidated } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	assignmentFormSchema,
	endAssignmentSchema,
	resetScheduleSchema,
	staffScheduleFormSchema,
	type AssignTargetKind,
	type PatternMessage
} from '#lib/schemas/pattern.schema.js';
import { failForm } from '#lib/server/errors.js';
import { assign, endAssignment } from '#lib/server/services/assignments/assignments.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import { resetSchedule, setSchedule } from '#lib/server/services/schedules/schedules.bl.js';

// The assign / end / own-rules forms shared by the team, employee and department pages (builder
// plan 4.3–4.5). Each page loads the empty forms and calls these from its actions; the target comes
// from the page, never from the posted form.

const ids = {
	assign: 'assign',
	end: 'end-assignment',
	schedule: 'schedule',
	reset: 'schedule-reset'
} as const;

/** The empty forms, starting today. */
export async function patternForms(today: string, target: { kind: AssignTargetKind; id: string }) {
	return {
		assignForm: await superValidate(
			{
				patternId: undefined,
				targetKind: target.kind,
				targetIds: [target.id],
				effectiveFrom: today,
				anchorDate: today,
				reason: ''
			},
			zod4(assignmentFormSchema),
			{ id: ids.assign, errors: false }
		),
		endForm: await superValidate(
			{ targetKind: target.kind, targetId: target.id, effectiveFrom: today, reason: '' },
			zod4(endAssignmentSchema),
			{ id: ids.end, errors: false }
		),
		scheduleForm: await superValidate(
			{ staffId: undefined, effectiveFrom: today, reason: '' },
			zod4(staffScheduleFormSchema),
			{ id: ids.schedule, errors: false }
		),
		resetForm: await superValidate(
			{ staffId: undefined, effectiveFrom: today, reason: '' },
			zod4(resetScheduleSchema),
			{ id: ids.reset, errors: false }
		)
	};
}

type Result<S> = SuperValidated<S & Record<string, unknown>, PatternMessage>;

type Target = { kind: AssignTargetKind; id: string };

/**
 * Assign a library pattern to the page's target, or (a list page) to the one target of `kind`
 * posted in the form.
 */
export async function assignAction(
	request: Request,
	actor: Actor,
	target: Target | { kind: AssignTargetKind; fromForm: true },
	success: () => string
) {
	const form: Result<Infer<typeof assignmentFormSchema>> = await superValidate(
		request,
		zod4(assignmentFormSchema),
		{ id: ids.assign }
	);
	if (!form.valid) return fail(400, { form });
	if ('fromForm' in target) {
		const [id, ...rest] = form.data.targetIds;
		if (form.data.targetKind !== target.kind || !id || rest.length > 0) return fail(400, { form });
		target = { kind: target.kind, id };
	}
	try {
		await assign(actor, { ...form.data, targetKind: target.kind, targetIds: [target.id] });
		return message(form, { kind: 'success', text: success() } satisfies PatternMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}

/** Stop the page target's own assignment from a date. */
export async function endAssignmentAction(
	request: Request,
	actor: Actor,
	target: { kind: AssignTargetKind; id: string },
	success: () => string
) {
	const form: Result<Infer<typeof endAssignmentSchema>> = await superValidate(
		request,
		zod4(endAssignmentSchema),
		{ id: ids.end }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await endAssignment(actor, { ...form.data, targetKind: target.kind, targetId: target.id });
		return message(form, { kind: 'success', text: success() } satisfies PatternMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}

/**
 * A person's own off days / crew start. `allowed` limits the people a page may change (a team page:
 * its members).
 */
export async function setScheduleAction(
	request: Request,
	actor: Actor,
	allowed: (staffId: string) => boolean
) {
	const form: Result<Infer<typeof staffScheduleFormSchema>> = await superValidate(
		request,
		zod4(staffScheduleFormSchema),
		{ id: ids.schedule }
	);
	if (!form.valid) return fail(400, { form });
	if (!allowed(form.data.staffId))
		return message(
			form,
			{ kind: 'error', text: m.staff_error_not_found() } satisfies PatternMessage,
			{ status: 404 }
		);
	try {
		await setSchedule(actor, form.data);
		return message(form, { kind: 'success', text: m.schedule_saved() } satisfies PatternMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function resetScheduleAction(
	request: Request,
	actor: Actor,
	allowed: (staffId: string) => boolean
) {
	const form: Result<Infer<typeof resetScheduleSchema>> = await superValidate(
		request,
		zod4(resetScheduleSchema),
		{ id: ids.reset }
	);
	if (!form.valid) return fail(400, { form });
	if (!allowed(form.data.staffId))
		return message(
			form,
			{ kind: 'error', text: m.staff_error_not_found() } satisfies PatternMessage,
			{ status: 404 }
		);
	try {
		await resetSchedule(actor, form.data);
		return message(form, {
			kind: 'success',
			text: m.schedule_reset_done()
		} satisfies PatternMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}
