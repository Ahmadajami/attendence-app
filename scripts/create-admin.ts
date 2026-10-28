/**
 * Create an admin account from the command line (first admin, or a recovery admin with --force).
 *
 *   pnpm auth:create-admin <loginId> "<full name>" [--name-ar "<الاسم>"] [--days 1|7|30] [--force]
 *
 * Prints the admin's 6-digit sign-in code once (valid 7 days unless --days says otherwise).
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { connect, fail, newCode, parseLoginId, parseValidity, printCode, schema } from './lib.js';

const USAGE =
	'Usage: pnpm auth:create-admin <loginId> "<full name>" [--name-ar "<name>"] [--days 1|7|30] [--force]';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		'name-ar': { type: 'string' },
		days: { type: 'string' },
		force: { type: 'boolean', default: false }
	}
});

const [rawLoginId, rawFullName] = positionals;
if (!rawLoginId || !rawFullName?.trim()) fail(USAGE);

const loginId = parseLoginId(rawLoginId);
const fullName = rawFullName.trim();
const fullNameAr = values['name-ar']?.trim() || null;
const validity = parseValidity(values.days);

const db = connect();

const adminRole = await db.query.role.findFirst({
	where: eq(schema.role.key, 'admin'),
	columns: { id: true }
});
if (!adminRole) fail('Role "admin" not found. Run `pnpm db:migrate` first.');

const existingAdmin = await db.query.user.findFirst({
	where: and(eq(schema.user.roleId, adminRole.id), eq(schema.user.active, true)),
	columns: { loginId: true }
});
if (existingAdmin && !values.force) {
	fail(`An active admin already exists (ID ${existingAdmin.loginId}). Use --force to add another.`);
}

const taken = await db.query.user.findFirst({
	where: eq(schema.user.loginId, loginId),
	columns: { id: true }
});
if (taken) fail(`ID ${loginId} already has an account. Use \`pnpm auth:issue-code ${loginId}\`.`);

const { code, columns } = await newCode(validity);
const id = randomUUID();

await db.batch([
	db
		.insert(schema.user)
		.values({ id, loginId, fullName, fullNameAr, roleId: adminRole.id, ...columns }),
	db.insert(schema.auditLog).values({
		actorUserId: null,
		action: 'user.bootstrap_admin',
		entityType: 'user',
		entityId: id,
		after: {
			loginId,
			fullName,
			fullNameAr,
			role: 'admin',
			codeExpiresAt: columns.passwordExpiresAt,
			forced: values.force
		}
	})
]);

printCode(`Admin account created for ${fullName}.`, loginId, code, columns.passwordExpiresAt);
