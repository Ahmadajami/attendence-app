/**
 * Issue a new 6-digit sign-in code for an existing account from the command line. This is the
 * recovery path when no admin can sign in (code expired, account locked).
 *
 *   pnpm auth:issue-code <loginId> [--days 1|7|30]
 *
 * The old code stops working, the lock and failure counter are cleared, and every session of the
 * account is signed out. The new code is printed once.
 */
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { connect, fail, newCode, parseLoginId, parseValidity, printCode, schema } from './lib.js';

const USAGE = 'Usage: pnpm auth:issue-code <loginId> [--days 1|7|30]';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { days: { type: 'string' } }
});

const [rawLoginId] = positionals;
if (!rawLoginId) fail(USAGE);

const loginId = parseLoginId(rawLoginId);
const validity = parseValidity(values.days);

const db = connect();

const account = await db.query.user.findFirst({
	where: eq(schema.user.loginId, loginId),
	columns: { id: true, fullName: true, active: true, passwordExpiresAt: true, lockedAt: true }
});
if (!account) fail(`No account with ID ${loginId}.`);
if (!account.active)
	fail(`Account ${loginId} is deactivated. Reactivate it before issuing a code.`);

const { code, columns } = await newCode(validity);

await db.batch([
	db.update(schema.user).set(columns).where(eq(schema.user.id, account.id)),
	db.delete(schema.session).where(eq(schema.session.userId, account.id)),
	db.insert(schema.auditLog).values({
		actorUserId: null,
		action: 'user.issue_code',
		entityType: 'user',
		entityId: account.id,
		before: { codeExpiresAt: account.passwordExpiresAt, lockedAt: account.lockedAt },
		after: { codeExpiresAt: columns.passwordExpiresAt, lockedAt: null, via: 'cli' }
	})
]);

printCode(
	`New sign-in code issued for ${account.fullName}.`,
	loginId,
	code,
	columns.passwordExpiresAt
);
