import { fail, type RequestEvent } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	ASSIGN_TARGETS,
	editFromDateSchema,
	patternBuilderSchema,
	type AssignTargetKind,
	type PatternMessage
} from '#lib/schemas/pattern.schema.js';
import { shiftFormSchema, type ShiftMessage } from '#lib/schemas/shift.schema.js';
import { failForm } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { buildPattern, editFromDate } from '#lib/server/services/assignments/assignments.bl.js';
import type { Actor } from '#lib/server/services/common.js';
import { createShift, listShifts } from '#lib/server/services/shifts/shifts.bl.js';
import { listActiveDepartments, listStaff } from '#lib/server/services/staff.js';
import { listTeams } from '#lib/server/services/teams/teams.bl.js';
import { lookupName } from '#lib/utils/locale.js';

// The 3-step pattern builder (builder plan 4.2), shared by `/patterns/new` and `/patterns/[id]`.
// View with `staff.write`; the services check `roster.manage` for every write (B14).

export function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

/** What step 2 and step 3 offer: shifts, and who a pattern can be assigned to (ids and names only). */
export async function builderOptions(actor: Actor) {
	const [shifts, staff, teams, departments] = await Promise.all([
		listShifts(actor),
		listStaff(actor),
		listTeams(actor),
		listActiveDepartments(actor)
	]);
	return {
		shifts,
		targets: {
			staff: staff
				.filter((s) => s.active)
				.map((s) => ({
					id: s.id,
					nameEn: s.fullName,
					nameAr: s.fullNameAr,
					detail: s.employeeNo,
					departmentId: s.department?.id ?? null
				})),
			team: teams
				.filter((t) => t.active)
				.map((t) => ({
					id: t.id,
					nameEn: t.nameEn,
					nameAr: t.nameAr,
					detail: null,
					departmentId: t.departmentId
				})),
			department: departments.map((d) => ({
				id: d.id,
				nameEn: d.nameEn,
				nameAr: d.nameAr,
				detail: null,
				departmentId: d.id
			}))
		},
		departments
	};
}

/** `?targetKind=team&targetId=…` from an assign sheet's "Build a new pattern" link. */
export function prefilledTarget(url: URL): { kind: AssignTargetKind; id: string } | null {
	const kind = url.searchParams.get('targetKind');
	const id = url.searchParams.get('targetId');
	if (!id || !ASSIGN_TARGETS.includes(kind as AssignTargetKind)) return null;
	return { kind: kind as AssignTargetKind, id };
}

export async function shiftForm() {
	return superValidate(zod4(shiftFormSchema), { id: 'shift', errors: false });
}

export const builderActions = {
	save: async ({ request, locals }: RequestEvent) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof patternBuilderSchema>, PatternMessage>(
			request,
			zod4(patternBuilderSchema),
			{ id: 'builder' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			form.data.patternId = await buildPattern(actor, form.data);
			return message(form, {
				kind: 'success',
				text: form.data.assign ? m.patterns_saved_assigned() : m.patterns_saved()
			} satisfies PatternMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	editFromDate: async ({ request, locals }: RequestEvent) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof editFromDateSchema>, PatternMessage>(
			request,
			zod4(editFromDateSchema),
			{ id: 'edit-from-date' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			form.data.patternId = await editFromDate(actor, form.data);
			return message(form, {
				kind: 'success',
				text: m.patterns_edited_from({ date: form.data.effectiveFrom })
			} satisfies PatternMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	/** "＋ New shift" in step 2: the `/shifts` sheet, posted here (F3). */
	saveShift: async ({ request, locals }: RequestEvent) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof shiftFormSchema>, ShiftMessage>(
			request,
			zod4(shiftFormSchema),
			{ id: 'shift' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			// Always a new shift here; `shiftId` is ignored.
			const row = await createShift(actor, form.data);
			return message(form, {
				kind: 'success',
				text: m.shifts_created({ name: `${lookupName(row)} (${row.code})` })
			} satisfies ShiftMessage);
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
