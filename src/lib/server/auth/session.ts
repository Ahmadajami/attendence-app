import { createHash, randomBytes } from 'node:crypto';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { and, eq, lt, ne } from 'drizzle-orm';
import { dev } from '$app/env';
import { db } from '#lib/server/db/index.js';
import { session, type sessionClient } from '#lib/server/db/schema/index.js';
import type { PermissionKey, RoleKey } from '#lib/server/rbac/permissions.js';

export type SessionClient = (typeof sessionClient.enumValues)[number];

export const SESSION_COOKIE = 'session';

const HOUR_MS = 60 * 60 * 1000;

/**
 * `web`: cookie session, slides while the user is active.
 * `api`: refresh-token session; only `/api/auth/refresh` extends it (by rotating the token).
 */
export const SESSION_TTL_MS: Record<SessionClient, number> = {
	web: 12 * HOUR_MS,
	api: 7 * 24 * HOUR_MS
};

export type AuthUser = {
	id: string;
	loginId: string;
	fullName: string;
	fullNameAr: string | null;
	role: { key: RoleKey; nameEn: string; nameAr: string };
	/** When the issued sign-in code stops working (and every session with it). */
	credentialExpiresAt: Date | null;
};

export type AuthSession = {
	id: string;
	client: SessionClient;
	expiresAt: Date;
};

export type ValidatedSession = {
	user: AuthUser;
	session: AuthSession;
	permissions: ReadonlySet<PermissionKey>;
	/** `expiresAt` was pushed forward; a cookie session must re-send its cookie. */
	renewed: boolean;
};

/**
 * What layouts send to the browser about the signed-in user: display fields and permission keys
 * (for hiding UI only; the server re-checks every action). No secrets, no session data.
 */
export function toSessionUser(user: AuthUser, permissions: ReadonlySet<PermissionKey>) {
	return {
		loginId: user.loginId,
		fullName: user.fullName,
		fullNameAr: user.fullNameAr,
		role: user.role,
		credentialExpiresAt: user.credentialExpiresAt,
		permissions: [...permissions]
	};
}

export type SessionUser = ReturnType<typeof toSessionUser>;

/** 256-bit random secret for the cookie or the refresh token. Never stored. */
export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Session primary key: SHA-256 of the secret token. */
export function sessionIdFromToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export type RequestMeta = { ip: string | null; userAgent: string | null };

export function requestMeta(event: RequestEvent): RequestMeta {
	let ip: string | null = null;
	try {
		ip = event.getClientAddress();
	} catch {
		// Not available in every adapter/context; the session still works without it.
	}
	return { ip, userAgent: event.request.headers.get('user-agent')?.slice(0, 512) ?? null };
}

/** `now + ttl`, but never past `notAfter` (the expiry of the user's issued code). */
function cappedExpiry(now: number, ttl: number, notAfter: Date | null): Date {
	const expiry = now + ttl;
	return new Date(notAfter ? Math.min(expiry, notAfter.getTime()) : expiry);
}

/**
 * Build a new session. Returns the secret `token` (send it to the client, once) and the insert
 * `query`, which the caller runs inside its `db.batch([...])` with the audit / login-attempt rows.
 * `notAfter` is the user's code expiry: a session never outlives the code it was opened with.
 */
export function createSession(
	userId: string,
	client: SessionClient,
	meta: RequestMeta,
	notAfter: Date | null
) {
	const token = generateSessionToken();
	const id = sessionIdFromToken(token);
	const expiresAt = cappedExpiry(Date.now(), SESSION_TTL_MS[client], notAfter);
	const query = db
		.insert(session)
		.values({ id, userId, client, expiresAt, ip: meta.ip, userAgent: meta.userAgent });
	return { token, id, expiresAt, query };
}

/**
 * Load a session with its user, role and permissions in one query. Returns `null` (and deletes
 * the row when it is dead) if the session is missing, of the wrong client type, expired, belongs
 * to a deactivated user, or the user's issued code has expired.
 */
export async function validateSession(
	sessionId: string,
	client: SessionClient
): Promise<ValidatedSession | null> {
	const row = await db.query.session.findFirst({
		where: eq(session.id, sessionId),
		columns: { id: true, client: true, expiresAt: true },
		with: {
			user: {
				columns: {
					id: true,
					loginId: true,
					fullName: true,
					fullNameAr: true,
					active: true,
					passwordExpiresAt: true
				},
				with: {
					role: {
						columns: { key: true, nameEn: true, nameAr: true },
						with: { rolePermissions: { with: { permission: { columns: { key: true } } } } }
					}
				}
			}
		}
	});

	if (!row || row.client !== client) return null;

	const now = Date.now();
	const codeExpiresAt = row.user.passwordExpiresAt;
	if (
		row.expiresAt.getTime() <= now ||
		!row.user.active ||
		(codeExpiresAt && codeExpiresAt.getTime() <= now)
	) {
		await invalidateSession(row.id);
		return null;
	}

	let expiresAt = row.expiresAt;
	let renewed = false;
	const ttl = SESSION_TTL_MS[client];
	if (client === 'web' && expiresAt.getTime() - now < ttl / 2) {
		const next = cappedExpiry(now, ttl, codeExpiresAt);
		if (next > expiresAt) {
			expiresAt = next;
			await db.update(session).set({ expiresAt }).where(eq(session.id, row.id));
			renewed = true;
		}
	}

	const { role, ...u } = row.user;
	const roleKey = role.key;
	return {
		user: {
			id: u.id,
			loginId: u.loginId,
			fullName: u.fullName,
			fullNameAr: u.fullNameAr,
			role: { key: roleKey, nameEn: role.nameEn, nameAr: role.nameAr },
			credentialExpiresAt: codeExpiresAt
		},
		session: { id: row.id, client: row.client, expiresAt },
		permissions: new Set(role.rolePermissions.map((rp) => rp.permission.key)),
		renewed
	};
}

/** Delete one session. Await it, or pass it to `db.batch([...])`. */
export function invalidateSession(sessionId: string) {
	return db.delete(session).where(eq(session.id, sessionId));
}

/** Delete every expired session (all users). Await it, or pass it to `db.batch([...])`. */
export function deleteExpiredSessions() {
	return db.delete(session).where(lt(session.expiresAt, new Date()));
}

/** Delete every session of a user (web and API), optionally keeping the current one. */
export function invalidateUserSessions(userId: string, options: { except?: string } = {}) {
	return db
		.delete(session)
		.where(
			options.except
				? and(eq(session.userId, userId), ne(session.id, options.except))
				: eq(session.userId, userId)
		);
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: expiresAt
	});
}

export function deleteSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
