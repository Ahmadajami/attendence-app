import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { role, user } from '#lib/server/db/schema/index.js';
import type { PermissionKey } from '#lib/server/rbac/permissions.js';
import type { AuthUser } from './session.js';

/**
 * The account every request acts as in `AUTH_MODE=local_single_user` (plan D17): the oldest active
 * admin, created once with `pnpm auth:create-admin`. `null` when there is none yet.
 */
export async function loadLocalAdmin(): Promise<{
	user: AuthUser;
	permissions: ReadonlySet<PermissionKey>;
} | null> {
	const [admin] = await db
		.select({ id: user.id })
		.from(user)
		.innerJoin(role, eq(role.id, user.roleId))
		.where(and(eq(role.key, 'admin'), eq(user.active, true)))
		.orderBy(asc(user.createdAt))
		.limit(1);
	if (!admin) return null;

	const row = await db.query.user.findFirst({
		where: eq(user.id, admin.id),
		columns: { id: true, loginId: true, fullName: true, fullNameAr: true },
		with: {
			role: {
				columns: { key: true, nameEn: true, nameAr: true },
				with: { rolePermissions: { with: { permission: { columns: { key: true } } } } }
			}
		}
	});
	if (!row) return null;

	const { role: r, ...u } = row;
	return {
		user: {
			id: u.id,
			loginId: u.loginId,
			fullName: u.fullName,
			fullNameAr: u.fullNameAr,
			role: { key: r.key, nameEn: r.nameEn, nameAr: r.nameAr },
			// Local mode has no sign-in code, so nothing expires.
			credentialExpiresAt: null
		},
		permissions: new Set(r.rolePermissions.map((rp) => rp.permission.key))
	};
}
