import { error, json } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { impactRequestSchema } from '#lib/schemas/pattern.schema.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { previewAssign } from '#lib/server/services/assignments/assignments.bl.js';
import type { RequestHandler } from './$types';

// The builder's and the assign sheet's impact preview (builder plan step 3): counts only, nothing
// saved; the response names the targets, no one else. An `AppError` propagates to `handleError`.
export const POST: RequestHandler = async ({ request, locals }) => {
	const actor = {
		user: requirePermission(locals, 'roster.manage'),
		permissions: locals.permissions
	};
	const parsed = impactRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, m.api_invalid_request(), { code: 'invalid_request' });
	const { type, slots, defaultWorkShiftId, ...target } = parsed.data;
	return json(await previewAssign(actor, { type, slots, defaultWorkShiftId }, target));
};
