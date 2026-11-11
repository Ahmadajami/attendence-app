import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { SWAP_KINDS } from '#lib/schemas/enums.js';
import { swapFormSchema, type SwapMessage } from '#lib/schemas/swap.schema.js';
import { failForm } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { loadShifts } from '#lib/server/services/shifts/shifts.bl.js';
import { createSwap, getSwapPerson } from '#lib/server/services/swaps/swaps.bl.js';
import { todayInDamascus } from '#lib/server/time.js';
import type { Actions, PageServerLoad } from './$types';

// New swap (swaps plan SW2, SW3, SW9): the form, A and B's roster for a month (tap a day to set a
// date) and the live preview. `?staff=…&date=…` fills person A and the first date (the employee
// day panel); `?kind=shift_change` opens a shift change (plan 2026-11-11-shift-change-request). Needs `attendance.record`; Save and approve needs `roster.manage` (the service
// checks).

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'attendance.record'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	const staff = url.searchParams.get('staff');
	const date = url.searchParams.get('date');
	const kind = z.enum(SWAP_KINDS).safeParse(url.searchParams.get('kind'));
	const [person, shifts] = await Promise.all([
		z.uuid().safeParse(staff).success ? getSwapPerson(actor, staff as string) : null,
		loadShifts()
	]);
	const form = await superValidate(
		{
			...(kind.success ? { kind: kind.data } : {}),
			staffId: person?.staffId ?? '',
			firstDate: z.iso.date().safeParse(date).success ? (date as string) : ''
		},
		zod4(swapFormSchema),
		{ id: 'swap', errors: false }
	);
	return {
		form,
		person,
		shifts,
		today: todayInDamascus(),
		canApprove: actor.permissions.has('roster.manage')
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof swapFormSchema>, SwapMessage>(
			request,
			zod4(swapFormSchema),
			{ id: 'swap' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			const { id, state } = await createSwap(actor, form.data);
			const approved = state === 'approved';
			return message(form, {
				kind: 'success',
				text: approved ? m.swap_saved_approved() : m.swap_saved_pending(),
				swapId: id,
				tab: approved ? 'approved' : 'pending',
				month: form.data.firstDate.slice(0, 7)
			});
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
