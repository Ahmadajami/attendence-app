import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { loginSchema } from '#lib/schemas/auth.schema.js';
import { apiError, readJson, tokenResponse } from '#lib/server/auth/api.js';
import { LOGIN_FAILURE, authenticate } from '#lib/server/auth/login.js';
import { requestMeta } from '#lib/server/auth/session.js';
import type { RequestHandler } from './$types';

const tokenRequest = z.object({ idNumber: z.string(), code: z.string() });

/** Sign in: `{ idNumber, code }` → access JWT + refresh token (an `api` session). */
export const POST: RequestHandler = async (event) => {
	const body = await readJson(event.request, tokenRequest);
	if (!body) return apiError(400, 'invalid_request', m.api_invalid_request());

	// Same rules as the web form (digits only, 6-digit code, Arabic-Indic digits normalised).
	const parsed = loginSchema.safeParse({ idNumber: body.idNumber, password: body.code });
	if (!parsed.success) {
		return apiError(
			400,
			'invalid_request',
			parsed.error.issues[0]?.message ?? m.api_invalid_request()
		);
	}

	const { idNumber, password: code } = parsed.data;
	const result = await authenticate(idNumber, code, 'api', requestMeta(event));
	if (!result.ok) {
		const failure = LOGIN_FAILURE[result.reason];
		return apiError(failure.status, result.reason, failure.text());
	}

	return tokenResponse(result.userId, result.sessionId, result.token, result.expiresAt);
};
