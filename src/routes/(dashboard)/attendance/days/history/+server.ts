import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { getDayHistory } from '#lib/server/services/daily/daily.bl.js';
import type { RequestHandler } from './$types';

// A person's edit log of one shift date (pay plan PR24): the History sheet of the daily page and
// of the employee page's day panel. Values are figures, times, ids and enum keys only; absence
// reasons are never in the log. An `AppError` propagates to `handleError`.

const query = z.object({ staffId: z.uuid(), date: z.iso.date() });

export const GET: RequestHandler = async ({ url, locals }) => {
	const actor = { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
	const parsed = query.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) error(400, m.api_invalid_request(), { code: 'invalid_request' });
	return json(await getDayHistory(actor, parsed.data.staffId, parsed.data.date));
};
