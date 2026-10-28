import { randomUUID } from 'node:crypto';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { m } from '#lib/paraglide/messages.js';
import { auditInsert } from '#lib/server/audit.js';
import {
	codeExpiresAt,
	generateCode,
	type CodeValidityHours
} from '#lib/server/auth/credentials.js';
import { hashPassword } from '#lib/server/auth/password.js';
import { invalidateUserSessions } from '#lib/server/auth/session.js';
import { db } from '#lib/server/db/index.js';
import {
	ConflictError,
	ForbiddenError,
	InvalidInputError,
	NotFoundError
} from '#lib/server/errors.js';
import { role, user } from '#lib/server/db/schema/index.js';
import { ACCOUNT_ROLES } from '#lib/server/rbac/permissions.js';
import { pgErrorCode, type Actor } from './common.js';

// Account management (CLAUDE.md §8). Only admins (`user.manage`) use it today: they
// create admin / operations-manager accounts and issue sign-in codes. Each function checks the
// permission, applies the change, and writes the audit row in the same `db.batch([...])`.

export type { Actor } from './common.js';

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** A freshly issued code, returned once so the page can show it once. */
export type IssuedCode = { code: string; expiresAt: Date; fullName: string; loginId: string };

function requireManage(actor: Actor) {
	if (!actor.permissions.has('user.manage')) throw new ForbiddenError();
}

function isAccountRole(key: string): key is AccountRole {
	return (ACCOUNT_ROLES as readonly string[]).includes(key);
}

/** Columns that store a freshly issued code; also clears any lockout. */
async function codeColumns(validity: CodeValidityHours, now = new Date()) {
	const code = generateCode();
	return {
		code,
		columns: {
			passwordHash: await hashPassword(code),
			passwordChangedAt: now,
			passwordExpiresAt: codeExpiresAt(validity, now),
			failedLoginCount: 0,
			lockedAt: null
		}
	};
}

async function findAccount(id: string) {
	const row = await db.query.user.findFirst({
		where: eq(user.id, id),
		columns: {
			id: true,
			loginId: true,
			fullName: true,
			fullNameAr: true,
			active: true,
			passwordExpiresAt: true,
			lockedAt: true
		},
		with: { role: { columns: { key: true } } }
	});
	if (!row) throw new NotFoundError(m.users_error_not_found());
	return { ...row, roleKey: row.role.key };
}

async function roleIdFor(key: AccountRole): Promise<string> {
	const row = await db.query.role.findFirst({ where: eq(role.key, key), columns: { id: true } });
	if (!row) throw new InvalidInputError('invalid_role', m.users_error_role(), { field: 'role' });
	return row.id;
}

/** Active admins other than `exceptUserId`. */
async function otherActiveAdmins(exceptUserId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(user)
		.innerJoin(role, eq(role.id, user.roleId))
		.where(and(eq(role.key, 'admin'), eq(user.active, true), ne(user.id, exceptUserId)));
	return row.count;
}

export async function listAccounts(actor: Actor) {
	requireManage(actor);
	const rows = await db.query.user.findMany({
		columns: {
			id: true,
			loginId: true,
			fullName: true,
			fullNameAr: true,
			active: true,
			passwordExpiresAt: true,
			lockedAt: true,
			lastLoginAt: true,
			createdAt: true
		},
		with: { role: { columns: { key: true, nameEn: true, nameAr: true } } },
		orderBy: [asc(user.createdAt)]
	});
	return rows.map((row) => ({ ...row, isSelf: row.id === actor.user.id }));
}

export async function listAccountRoles(actor: Actor) {
	requireManage(actor);
	const rows = await db.query.role.findMany({ columns: { key: true, nameEn: true, nameAr: true } });
	return rows.filter((r) => isAccountRole(r.key));
}

export async function createAccount(
	actor: Actor,
	input: {
		loginId: string;
		fullName: string;
		fullNameAr: string | null;
		role: string;
		validity: CodeValidityHours;
	}
): Promise<IssuedCode> {
	requireManage(actor);
	if (!isAccountRole(input.role))
		throw new InvalidInputError('invalid_role', m.users_error_role(), { field: 'role' });

	const roleId = await roleIdFor(input.role);
	const { code, columns } = await codeColumns(input.validity);
	const id = randomUUID();

	try {
		await db.batch([
			db.insert(user).values({
				id,
				loginId: input.loginId,
				fullName: input.fullName,
				fullNameAr: input.fullNameAr,
				roleId,
				createdBy: actor.user.id,
				...columns
			}),
			auditInsert({
				actor: actor.user,
				action: 'user.create',
				entityType: 'user',
				entityId: id,
				after: {
					loginId: input.loginId,
					fullName: input.fullName,
					fullNameAr: input.fullNameAr,
					role: input.role,
					codeExpiresAt: columns.passwordExpiresAt
				}
			})
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('duplicate_login_id', m.users_error_duplicate(), {
				field: 'loginId',
				cause: error
			});
		throw error;
	}

	return {
		code,
		expiresAt: columns.passwordExpiresAt,
		fullName: input.fullName,
		loginId: input.loginId
	};
}

/**
 * New code for any account, including the actor's own. The old code stops working and every
 * session of the account ends, except the actor's current one when renewing their own code.
 */
export async function issueCode(
	actor: Actor,
	userId: string,
	validity: CodeValidityHours,
	currentSessionId: string | undefined
): Promise<IssuedCode> {
	requireManage(actor);
	const target = await findAccount(userId);
	if (!target.active) throw new ConflictError('inactive', m.users_error_inactive());

	const { code, columns } = await codeColumns(validity);
	const self = target.id === actor.user.id;

	await db.batch([
		db.update(user).set(columns).where(eq(user.id, target.id)),
		invalidateUserSessions(target.id, { except: self ? currentSessionId : undefined }),
		auditInsert({
			actor: actor.user,
			action: 'user.issue_code',
			entityType: 'user',
			entityId: target.id,
			before: { codeExpiresAt: target.passwordExpiresAt, lockedAt: target.lockedAt },
			after: { codeExpiresAt: columns.passwordExpiresAt, lockedAt: null, via: 'web' }
		})
	]);

	return {
		code,
		expiresAt: columns.passwordExpiresAt,
		fullName: target.fullName,
		loginId: target.loginId
	};
}

/** Deactivating signs the account out everywhere at once. Never yourself, never the last admin. */
export async function setAccountActive(actor: Actor, userId: string, active: boolean) {
	requireManage(actor);
	const target = await findAccount(userId);
	if (target.active === active) return target;
	if (!active) {
		if (target.id === actor.user.id) throw new ConflictError('self', m.users_error_self());
		if (target.roleKey === 'admin' && (await otherActiveAdmins(target.id)) === 0) {
			throw new ConflictError('last_admin', m.users_error_last_admin());
		}
	}

	await db.batch([
		db.update(user).set({ active }).where(eq(user.id, target.id)),
		...(active ? [] : [invalidateUserSessions(target.id)]),
		auditInsert({
			actor: actor.user,
			action: active ? 'user.activate' : 'user.deactivate',
			entityType: 'user',
			entityId: target.id,
			before: { active: target.active },
			after: { active }
		})
	]);
	return target;
}

/** Permissions are reloaded on every request, so a role change applies on the next one. */
export async function changeAccountRole(actor: Actor, userId: string, newRole: string) {
	requireManage(actor);
	if (!isAccountRole(newRole))
		throw new InvalidInputError('invalid_role', m.users_error_role(), { field: 'role' });
	const target = await findAccount(userId);
	if (target.roleKey === newRole) return target;
	if (target.id === actor.user.id) throw new ConflictError('self', m.users_error_self());
	if (target.roleKey === 'admin' && (await otherActiveAdmins(target.id)) === 0) {
		throw new ConflictError('last_admin', m.users_error_last_admin());
	}

	await db.batch([
		db
			.update(user)
			.set({ roleId: await roleIdFor(newRole) })
			.where(eq(user.id, target.id)),
		auditInsert({
			actor: actor.user,
			action: 'user.change_role',
			entityType: 'user',
			entityId: target.id,
			before: { role: target.roleKey },
			after: { role: newRole }
		})
	]);
	return target;
}
