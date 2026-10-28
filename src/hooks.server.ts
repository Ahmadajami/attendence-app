import { sequence, type Handle, type HandleServerError } from '@sveltejs/kit/hooks';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { dev } from '$app/env';
import { frameworkError, internalError } from '#lib/errors.js';
import { m } from '#lib/paraglide/messages.js';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { AppError } from '#lib/server/errors.js';
import { pgErrorCode } from '#lib/server/services/common.js';
import { bearerToken, verifyAccessToken } from '#lib/server/auth/jwt.js';
import {
	SESSION_COOKIE,
	deleteSessionCookie,
	sessionIdFromToken,
	setSessionCookie,
	validateSession
} from '#lib/server/auth/session.js';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

/**
 * Resolves the caller to a session, the same way for both transports:
 * - `Authorization: Bearer <jwt>` (CSR / mobile): verify the access JWT, then load its `sid`
 *   (must be an `api` session). The cookie is ignored on these requests.
 * - otherwise the `session` cookie (SSR): hash the token, load it (must be a `web` session).
 * This only identifies the caller; loads and actions still call `requirePermission()`.
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.permissions = new Set();
	event.locals.authMethod = null;

	const bearer = bearerToken(event.request);
	if (bearer) {
		const claims = await verifyAccessToken(bearer);
		const result = claims && (await validateSession(claims.sessionId, 'api'));
		if (result && result.user.id === claims.userId) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			event.locals.permissions = result.permissions;
			event.locals.authMethod = 'bearer';
		}
		return resolve(event);
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const result = await validateSession(sessionIdFromToken(token), 'web');
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			event.locals.permissions = result.permissions;
			event.locals.authMethod = 'cookie';
			if (result.renewed) setSessionCookie(event.cookies, token, result.session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	return resolve(event);
};

/**
 * Baseline security headers on every response. Framing is denied so no other site can overlay
 * the admin screens (e.g. issuing sign-in codes); HSTS only outside dev, where there is no HTTPS.
 */
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers: Record<string, string> = {
		'x-frame-options': 'DENY',
		'content-security-policy': "frame-ancestors 'none'",
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'strict-origin-when-cross-origin'
	};
	if (!dev) headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
	for (const [name, value] of Object.entries(headers)) {
		// Redirects and some responses come with immutable headers; skip those quietly.
		try {
			response.headers.set(name, value);
		} catch {
			break;
		}
	}
	return response;
};

export const handle: Handle = sequence(handleSecurityHeaders, handleParaglide, handleAuth);

/**
 * A failed Drizzle query carries its bound params (codes' hashes, tokens), so log the query text
 * and the driver error instead (CLAUDE.md §8: never log secrets).
 */
function loggable(error: unknown): unknown {
	if (error instanceof DrizzleQueryError) return { query: error.query, cause: error.cause };
	return error;
}

/**
 * Every error passes through here before `+error.svelte` (or JSON for `+server.ts` and API
 * clients) shows it. App errors (`error(status, message, { code })`) are already safe. An
 * `AppError` a service threw becomes its status, code and message. Anything else is logged and
 * hidden behind `internal`. Framework errors (404s) are routine and not logged. Must never throw.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	switch (kind) {
		case 'app':
			return error;
		case 'framework':
			return frameworkError(error.status, error.message);
		case 'validation':
			return { code: 'invalid_input' };
	}

	if (error instanceof AppError) {
		return { status: error.status, code: error.code, message: error.message };
	}

	console.error(
		`[handleError] ${event.request.method} ${event.route.id ?? event.url.pathname}`,
		loggable(error)
	);
	// An overlap the service didn't map is still a conflict, never a silent 500 (CLAUDE.md §6.2).
	if (pgErrorCode(error) === '23P01') {
		return { status: 409, code: 'conflict', message: m.error_conflict() };
	}
	return internalError();
};
