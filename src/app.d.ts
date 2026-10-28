// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthSession, AuthUser } from '#lib/server/auth/session.js';
import type { PermissionKey } from '#lib/server/rbac/permissions.js';

declare global {
	namespace App {
		/**
		 * Always has `status` and `message` (safe to show, localized). Required here, so every
		 * `error(status, message, { code })` call and both `handleError` hooks must set a code.
		 */
		interface Error {
			/**
			 * Stable machine-readable code for API (CSR) clients and `+error.svelte`: an `AppError`
			 * code (`forbidden`, `not_found`, `duplicate_login_id`, …), `unauthenticated`, a
			 * framework code (`not_found`, `method_not_allowed`, `payload_too_large`,
			 * `request_error`), `conflict`, `invalid_input`, or `internal` for anything unexpected.
			 */
			code: string;
		}
		interface Locals {
			user: AuthUser | null;
			session: AuthSession | null;
			/** Empty when signed out. Always check with `requirePermission()` on the server. */
			permissions: ReadonlySet<PermissionKey>;
			/** How this request authenticated: SSR cookie or `Authorization: Bearer` access JWT. */
			authMethod: 'cookie' | 'bearer' | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
