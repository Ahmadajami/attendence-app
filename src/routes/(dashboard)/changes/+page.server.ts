import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import {
	swapCancelSchema,
	swapDecisionSchema,
	type SwapMessage
} from '#lib/schemas/swap.schema.js';
import { AppError, failForm } from '#lib/server/errors.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { parseStaffId } from '#lib/server/services/daily/daily.bl.js';
import { loadShifts } from '#lib/server/services/shifts/shifts.bl.js';
import {
	cancelSwap,
	decideSwap,
	getSwap,
	getSwapPerson,
	listSwaps,
	parseMonth,
	SWAP_TABS,
	type SwapDetail,
	type SwapTab
} from '#lib/server/services/swaps/swaps.bl.js';
import type { Actions, PageServerLoad } from './$types';

// The Swaps page (swaps plan SW1–SW12): requests by state, month and person; `?swap=<id>` opens
// one (the History's cause link, and the New swap page after a save). New swap is its own page,
// `/changes/new`. Viewing needs `attendance.record`; deciding and cancelling need `roster.manage`
// (the service checks).

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'attendance.record'), permissions: locals.permissions };
}

const isId = (value: string | null): string | null =>
	z.uuid().safeParse(value).success ? (value as string) : null;

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	const params = url.searchParams;
	const asked = params.get('state');
	const tab: SwapTab = SWAP_TABS.includes(asked as SwapTab) ? (asked as SwapTab) : 'pending';
	const month = parseMonth(params.get('month'));
	const staffId = parseStaffId(params.get('staff'));
	const swapId = isId(params.get('swap'));

	const [list, shifts, person, detail] = await Promise.all([
		listSwaps(actor, { tab, month, staffId }),
		loadShifts(),
		staffId ? getSwapPerson(actor, staffId) : null,
		swapId
			? getSwap(actor, swapId).catch((error: unknown): SwapDetail | null => {
					if (error instanceof AppError && error.status === 404) return null;
					throw error;
				})
			: null
	]);

	return {
		tab,
		month,
		staffId,
		person,
		...list,
		shifts,
		canApprove: actor.permissions.has('roster.manage'),
		swapId,
		detail
	};
};

const success = (text: string) => ({ kind: 'success', text }) satisfies SwapMessage;

export const actions: Actions = {
	decideSwap: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof swapDecisionSchema>, SwapMessage>(
			request,
			zod4(swapDecisionSchema),
			{ id: 'swap-decision' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			const { state } = await decideSwap(actor, form.data);
			return message(form, success(state === 'approved' ? m.swap_approved() : m.swap_rejected()));
		} catch (cause) {
			return failForm(form, cause);
		}
	},

	cancelSwap: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof swapCancelSchema>, SwapMessage>(
			request,
			zod4(swapCancelSchema),
			{ id: 'swap-cancel' }
		);
		if (!form.valid) return fail(400, { form });
		try {
			await cancelSwap(actor, form.data);
			return message(form, success(m.swap_cancelled()));
		} catch (cause) {
			return failForm(form, cause);
		}
	}
};
