import { error, redirect } from '@sveltejs/kit';
import { localizedHref } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';
import type { AuthUser } from '#lib/server/auth/session.js';
import type { PermissionKey } from './permissions.js';

// Server-side enforcement (CLAUDE.md §6.1). Works the same for cookie (SSR) and Bearer JWT (API)
// requests, because hooks.server.ts fills `locals` identically for both.

/**
 * For page layout loads: signed out → `/login`. Layouts don't guard form actions, so actions still
 * call `requirePermission`.
 */
export function requireSignedIn(locals: App.Locals): AuthUser {
	if (!locals.user) redirect(303, localizedHref('/login'));
	return locals.user;
}

/** The signed-in user, or a 401. */
export function requireUser(locals: App.Locals): AuthUser {
	if (!locals.user) error(401, m.auth_unauthenticated(), { code: 'unauthenticated' });
	return locals.user;
}

/** The signed-in user if they hold `key`, otherwise 401/403. */
export function requirePermission(locals: App.Locals, key: PermissionKey): AuthUser {
	const user = requireUser(locals);
	if (!locals.permissions.has(key)) error(403, m.auth_forbidden(), { code: 'forbidden' });
	return user;
}

/** For showing/hiding UI only. Never a substitute for `requirePermission` in loads and actions. */
export function hasPermission(locals: App.Locals, key: PermissionKey): boolean {
	return !!locals.user && locals.permissions.has(key);
}
