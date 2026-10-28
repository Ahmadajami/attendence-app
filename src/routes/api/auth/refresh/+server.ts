import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { apiError, readJson, tokenResponse } from '#lib/server/auth/api.js';
import {
	createSession,
	requestMeta,
	sessionIdFromToken,
	validateSession
} from '#lib/server/auth/session.js';
import { db } from '#lib/server/db/index.js';
import { session } from '#lib/server/db/schema/index.js';
import type { RequestHandler } from './$types';

const refreshRequest = z.object({ refreshToken: z.string().min(1).max(256) });

/**
 * Rotate: the presented refresh token is consumed and a new pair is issued. A token can be used
 * once; replaying it (or racing two refreshes) gets 401. Never extends past the code's expiry.
 */
export const POST: RequestHandler = async (event) => {
	const body = await readJson(event.request, refreshRequest);
	if (!body) return apiError(400, 'invalid_request', m.api_invalid_request());

	const sessionId = sessionIdFromToken(body.refreshToken);
	const current = await validateSession(sessionId, 'api');
	if (!current) return apiError(401, 'invalid_token', m.api_invalid_token());

	// Delete first: only one caller can consume this token, even under concurrent requests.
	const consumed = await db
		.delete(session)
		.where(eq(session.id, sessionId))
		.returning({ id: session.id });
	if (consumed.length === 0) return apiError(401, 'invalid_token', m.api_invalid_token());

	const next = createSession(
		current.user.id,
		'api',
		requestMeta(event),
		current.user.credentialExpiresAt
	);
	await next.query;

	return tokenResponse(current.user.id, next.id, next.token, next.expiresAt);
};
