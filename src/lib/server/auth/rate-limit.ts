import { and, eq, gt, lt, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { loginAttempt, user } from '#lib/server/db/schema/index.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_LOGIN_ID = 5;
const MAX_FAILURES_PER_IP = 20;
/** Attempts are kept this long for review, then deleted by `deleteOldLoginAttempts`. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * True when this ID or IP has too many recent failed sign-ins (web login and token API).
 * Per-ID failures only count since the account's current code was issued, so issuing a new code
 * to a locked-out user lets them in straight away instead of after the window.
 */
export async function isLoginRateLimited(loginId: string, ip: string | null): Promise<boolean> {
	const since = new Date(Date.now() - WINDOW_MS);
	const codeIssuedAt = sql`(select ${user.passwordChangedAt} from ${user} where ${user.loginId} = ${loginId})`;
	const [counts] = await db
		.select({
			byLoginId:
				sql<number>`count(*) filter (where ${loginAttempt.loginId} = ${loginId} and ${loginAttempt.attemptedAt} > greatest(${since}, ${codeIssuedAt}))`.mapWith(
					Number
				),
			byIp: ip
				? sql<number>`count(*) filter (where ${loginAttempt.ip} = ${ip})`.mapWith(Number)
				: sql<number>`0`.mapWith(Number)
		})
		.from(loginAttempt)
		.where(
			and(
				eq(loginAttempt.success, false),
				gt(loginAttempt.attemptedAt, since),
				ip
					? or(eq(loginAttempt.loginId, loginId), eq(loginAttempt.ip, ip))
					: eq(loginAttempt.loginId, loginId)
			)
		);
	return counts.byLoginId >= MAX_FAILURES_PER_LOGIN_ID || counts.byIp >= MAX_FAILURES_PER_IP;
}

/** Delete attempts past the retention period. Await it, or pass it to `db.batch([...])`. */
export function deleteOldLoginAttempts() {
	return db
		.delete(loginAttempt)
		.where(lt(loginAttempt.attemptedAt, new Date(Date.now() - RETENTION_MS)));
}

/** Insert query for one attempt. Await it, or pass it to `db.batch([...])`. */
export function recordLoginAttempt(attempt: {
	loginId: string;
	ip: string | null;
	success: boolean;
}) {
	return db.insert(loginAttempt).values(attempt);
}
