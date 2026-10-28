import { SignJWT, jwtVerify } from 'jose';
import { AUTH_JWT_SECRET } from '$app/env/private';

// Access tokens for CSR / mobile clients. They only prove "this request belongs to session `sid`";
// hooks.server.ts still loads that session (user active? permissions?) on every request, so
// revoking the session revokes the token immediately.

const ALGORITHM = 'HS256';
const ISSUER = 'damascus-airport-ops';
const AUDIENCE = 'damascus-airport-ops:api';

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

let key: Uint8Array | undefined;

// Lazy: the variable is optional during `vite build` (src/env.ts) and required at runtime.
function signingKey(): Uint8Array {
	if (!AUTH_JWT_SECRET) throw new Error('AUTH_JWT_SECRET is not set');
	return (key ??= new TextEncoder().encode(AUTH_JWT_SECRET));
}

export type AccessTokenClaims = { userId: string; sessionId: string };

export function signAccessToken({ userId, sessionId }: AccessTokenClaims): Promise<string> {
	return new SignJWT({ sid: sessionId })
		.setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
		.setSubject(userId)
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
		.sign(signingKey());
}

/** Verified claims, or `null` for any invalid, expired, or foreign token. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
	try {
		const { payload } = await jwtVerify(token, signingKey(), {
			algorithms: [ALGORITHM],
			issuer: ISSUER,
			audience: AUDIENCE
		});
		if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
		return { userId: payload.sub, sessionId: payload.sid };
	} catch {
		return null;
	}
}

/** Token from an `Authorization: Bearer <token>` header, or `null`. */
export function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization');
	const match = header?.match(/^Bearer\s+(\S+)$/i);
	return match ? match[1] : null;
}
