import { toSessionUser } from '#lib/server/auth/session.js';
import { requireSignedIn } from '#lib/server/rbac/guard.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	user: toSessionUser(requireSignedIn(locals), locals.permissions)
});
