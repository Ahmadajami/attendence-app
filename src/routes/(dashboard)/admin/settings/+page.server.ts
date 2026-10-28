import { requirePermission } from '#lib/server/rbac/guard.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'settings.manage');
	return {};
};
