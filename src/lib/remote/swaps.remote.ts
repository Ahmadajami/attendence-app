import { getRequestEvent, query } from '$app/server';
import { z } from 'zod';
import { swapPreviewSchema } from '#lib/schemas/swap.schema.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { getSwapRoster, previewSwap as preview } from '#lib/server/services/swaps/swaps.bl.js';

// The New swap page's live reads (swaps plan SW2): what the swap does and why it can't apply, and
// A and B's roster for the month (who works, who is off). Both need `attendance.record`, like
// saving.

function actor() {
	const { locals } = getRequestEvent();
	return { user: requirePermission(locals, 'attendance.record'), permissions: locals.permissions };
}

export const previewSwap = query(swapPreviewSchema, async (input) => preview(actor(), input));

export const swapRoster = query(
	z.object({
		staffIds: z.array(z.uuid()).min(1).max(2),
		month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
	}),
	async ({ staffIds, month }) => getSwapRoster(actor(), staffIds, month)
);
