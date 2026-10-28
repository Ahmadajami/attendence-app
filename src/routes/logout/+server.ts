import { redirect } from '@sveltejs/kit';
import { localizedHref } from '#lib/i18n.js';
import { deleteSessionCookie, invalidateSession } from '#lib/server/auth/session.js';
import type { RequestHandler } from './$types';

// POST only (a plain form submit); SvelteKit's origin check blocks cross-site form posts.
// API clients sign out with `POST /api/auth/logout` (Phase F).
export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.authMethod === 'cookie' && locals.session) {
		await invalidateSession(locals.session.id);
	}
	deleteSessionCookie(cookies);
	redirect(303, localizedHref('/login'));
};
