import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { apiError, apiNoContent, readJson } from '#lib/server/auth/api.js';
import { sessionIdFromToken } from '#lib/server/auth/session.js';
import { db } from '#lib/server/db/index.js';
import { session } from '#lib/server/db/schema/index.js';
import type { RequestHandler } from './$types';

const logoutRequest = z.object({ refreshToken: z.string().min(1).max(256) });

/** Sign out an API client: its refresh token's session is deleted, so its access JWT dies too. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson(request, logoutRequest);
	if (!body) return apiError(400, 'invalid_request', m.api_invalid_request());

	await db
		.delete(session)
		.where(and(eq(session.id, sessionIdFromToken(body.refreshToken)), eq(session.client, 'api')));

	// Same answer whether or not the token existed.
	return apiNoContent();
};
