import { json } from '@sveltejs/kit';
import type { z } from 'zod';
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from './jwt.js';

// Helpers for the JSON token API (`/api/auth/*`) used by a future CSR / mobile client.
// Every response is `no-store`: tokens and user data must never sit in a shared cache.
// No CORS headers are sent, so only same-origin browser code can call these endpoints.

const NO_STORE = { 'cache-control': 'no-store' } as const;

export function apiJson(data: unknown, status = 200): Response {
	return json(data, { status, headers: NO_STORE });
}

/** `{ code, message }`: `code` is stable for clients to branch on, `message` is localized. */
export function apiError(status: number, code: string, message: string): Response {
	return apiJson({ code, message }, status);
}

export function apiNoContent(): Response {
	return new Response(null, { status: 204, headers: NO_STORE });
}

/** Parsed JSON body, or `null` when the body is not JSON or doesn't match `schema`. */
export async function readJson<T extends z.ZodType>(
	request: Request,
	schema: T
): Promise<z.infer<T> | null> {
	try {
		const result = schema.safeParse(await request.json());
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

/** Response body for a successful sign-in or refresh. The refresh token is shown once. */
export async function tokenResponse(
	userId: string,
	sessionId: string,
	refreshToken: string,
	refreshExpiresAt: Date
) {
	return apiJson({
		tokenType: 'Bearer',
		accessToken: await signAccessToken({ userId, sessionId }),
		expiresIn: ACCESS_TOKEN_TTL_SECONDS,
		refreshToken,
		refreshExpiresAt
	});
}
