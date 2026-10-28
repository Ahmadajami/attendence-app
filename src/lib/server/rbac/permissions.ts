// Keep in sync with the RBAC seed migrations in `drizzle/`: adding a key means changing this file
// and adding a new seed migration (CLAUDE.md §7).

export const PERMISSIONS = [
	'flight.read',
	'flight.write',
	'assignment.write',
	'attendance.record',
	'staff.write',
	'import.run',
	'report.read',
	'user.manage',
	'user.manage_operational',
	'user.issue_code',
	'settings.manage',
	'audit.read',
	'roster.manage',
	'overtime.approve'
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
	'admin',
	'operations_manager',
	'supervisor',
	'dispatcher',
	'viewer'
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** Roles that can have a sign-in account today (CLAUDE.md §8). */
export const ACCOUNT_ROLES = ['admin', 'operations_manager'] as const satisfies readonly RoleKey[];

/**
 * Employee roles. Every account (admin and operations manager today) signs in with an issued 6-digit
 * code. Employees don't have accounts yet; these scopes are kept for when they do.
 */
export const EMPLOYEE_ROLES = [
	'supervisor',
	'dispatcher',
	'viewer'
] as const satisfies readonly RoleKey[];

/**
 * Roles whose accounts a holder of each user-management permission may act on.
 * - `user.manage` (admin): every account, including issuing their own next code.
 * - `user.manage_operational` / `user.issue_code`: employee accounts only, never your own, so a
 *   manager can never mint a code for an admin or another manager.
 */
export const MANAGEABLE_ROLES = {
	'user.manage': ROLE_KEYS,
	'user.manage_operational': EMPLOYEE_ROLES,
	'user.issue_code': EMPLOYEE_ROLES
} as const satisfies Partial<Record<PermissionKey, readonly RoleKey[]>>;
