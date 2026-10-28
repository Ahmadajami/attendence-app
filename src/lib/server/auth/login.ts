import { eq, sql } from 'drizzle-orm';
import { m } from '#lib/paraglide/messages.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema/index.js';
import { MAX_CONSECUTIVE_CODE_FAILURES } from './credentials.js';
import { verifyDummyPassword, verifyPassword } from './password.js';
import { deleteOldLoginAttempts, isLoginRateLimited, recordLoginAttempt } from './rate-limit.js';
import {
	createSession,
	deleteExpiredSessions,
	type RequestMeta,
	type SessionClient
} from './session.js';

export type LoginFailure =
	/** Unknown ID, inactive account, or wrong code. Deliberately one reason. */
	| 'invalid'
	/** Too many recent failures for this ID or IP. */
	| 'rate_limited'
	/** Locked after too many consecutive wrong codes; needs a new code. */
	| 'locked'
	/** Correct code, but it has expired; needs a new code. */
	| 'code_expired';

/** HTTP status and localized message for each failure, shared by `/login` and the token API. */
export const LOGIN_FAILURE: Record<LoginFailure, { status: 400 | 403 | 429; text: () => string }> =
	{
		invalid: { status: 400, text: () => m.login_invalid() },
		rate_limited: { status: 429, text: () => m.login_rate_limited() },
		locked: { status: 403, text: () => m.login_locked() },
		code_expired: { status: 403, text: () => m.login_code_expired() }
	};

export type LoginResult =
	| { ok: false; reason: LoginFailure }
	| {
			ok: true;
			userId: string;
			sessionId: string;
			/** Secret for the cookie (web) or the refresh token (api). Send once, never store. */
			token: string;
			expiresAt: Date;
	  };

/**
 * Check an ID + 6-digit code and open a session. Shared by the web `/login`
 * action and the token API, so both get the same rate limit, lockout, and expiry rules.
 * `loginId` must already be normalised to ASCII digits.
 */
export async function authenticate(
	loginId: string,
	secret: string,
	client: SessionClient,
	meta: RequestMeta
): Promise<LoginResult> {
	if (await isLoginRateLimited(loginId, meta.ip)) {
		// A locked account hits the rate limit too; "locked" tells the user what actually helps.
		const blocked = await db.query.user.findFirst({
			where: eq(user.loginId, loginId),
			columns: { lockedAt: true }
		});
		return { ok: false, reason: blocked?.lockedAt ? 'locked' : 'rate_limited' };
	}

	const account = await db.query.user.findFirst({
		where: eq(user.loginId, loginId),
		columns: {
			id: true,
			active: true,
			passwordHash: true,
			passwordExpiresAt: true,
			failedLoginCount: true,
			lockedAt: true
		}
	});

	const failed = recordLoginAttempt({ loginId, ip: meta.ip, success: false });

	if (!account || !account.active) {
		await verifyDummyPassword(secret);
		await failed;
		return { ok: false, reason: 'invalid' };
	}

	// Always pay the Argon2 cost, so locked / expired accounts answer as slowly as the rest.
	const valid = await verifyPassword(account.passwordHash, secret);

	if (account.lockedAt) {
		await failed;
		return { ok: false, reason: 'locked' };
	}

	if (!valid) {
		const nowLocked = account.failedLoginCount + 1 >= MAX_CONSECUTIVE_CODE_FAILURES;
		await db.batch([
			failed,
			db
				.update(user)
				.set({
					failedLoginCount: sql`${user.failedLoginCount} + 1`,
					lockedAt: sql`case when ${user.failedLoginCount} + 1 >= ${MAX_CONSECUTIVE_CODE_FAILURES} then coalesce(${user.lockedAt}, now()) else ${user.lockedAt} end`
				})
				.where(eq(user.id, account.id))
		]);
		return { ok: false, reason: nowLocked ? 'locked' : 'invalid' };
	}

	const now = new Date();
	if (account.passwordExpiresAt && account.passwordExpiresAt <= now) {
		await failed;
		return { ok: false, reason: 'code_expired' };
	}

	const session = createSession(account.id, client, meta, account.passwordExpiresAt);
	await db.batch([
		session.query,
		recordLoginAttempt({ loginId, ip: meta.ip, success: true }),
		db.update(user).set({ failedLoginCount: 0, lastLoginAt: now }).where(eq(user.id, account.id)),
		// Housekeeping rides along with sign-ins: no cron job needed at this scale.
		deleteExpiredSessions(),
		deleteOldLoginAttempts()
	]);

	return {
		ok: true,
		userId: account.id,
		sessionId: session.id,
		token: session.token,
		expiresAt: session.expiresAt
	};
}
