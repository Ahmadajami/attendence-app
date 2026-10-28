import { m } from '#lib/paraglide/messages.js';
import { apiError, apiJson } from '#lib/server/auth/api.js';
import { toSessionUser } from '#lib/server/auth/session.js';
import type { RequestHandler } from './$types';

/** The signed-in user (Bearer access JWT, or the web cookie): what a CSR client needs to render. */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user || !locals.session) {
		return apiError(401, 'unauthenticated', m.auth_unauthenticated());
	}
	return apiJson({
		user: toSessionUser(locals.user, locals.permissions),
		session: { client: locals.session.client, expiresAt: locals.session.expiresAt }
	});
};
