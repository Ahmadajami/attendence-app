import type { AuthUser } from '#lib/server/auth/session.js';
import type { db } from '#lib/server/db/index.js';
import { ForbiddenError } from '#lib/server/errors.js';
import type { PermissionKey } from '#lib/server/rbac/permissions.js';

/** Every service takes the caller's user and permissions so it can enforce and audit itself. */
export type Actor = { user: AuthUser; permissions: ReadonlySet<PermissionKey> };

/** One statement of a `db.batch([...])`: what CRUD write builders return. */
export type BatchQuery = Parameters<typeof db.batch>[0][number];

/** Throws `ForbiddenError` (403) unless the actor holds every one of `keys`. */
export function requireActorPermission(actor: Actor, ...keys: PermissionKey[]): void {
	if (!keys.every((key) => actor.permissions.has(key))) throw new ForbiddenError();
}

/** SQLSTATE of a Postgres error, also when wrapped by drizzle (`cause`). */
export function pgErrorCode(error: unknown): string | undefined {
	for (let e = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
		const code = (e as { code?: unknown }).code;
		if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
	}
	return undefined;
}
