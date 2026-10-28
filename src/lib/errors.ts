import { m } from '#lib/paraglide/messages.js';

// Client-safe pieces of error handling, shared by the server and client `handleError` hooks.
// Service errors (`AppError`) live in `#lib/server/errors.ts`.

type ErrorBody = Omit<App.Error, 'status'>;

/**
 * `code` (and a localized message where users can hit it) for errors SvelteKit raises itself:
 * an unmatched route, a wrong method, a body over the size limit. SvelteKit's own message is
 * terse but safe, so it is kept for the rare statuses.
 */
export function frameworkError(status: number, message: string): ErrorBody {
	switch (status) {
		case 404:
			return { code: 'not_found', message: m.error_not_found() };
		case 405:
			return { code: 'method_not_allowed', message };
		case 413:
			return { code: 'payload_too_large', message: m.error_payload_too_large() };
		default:
			return { code: 'request_error', message };
	}
}

/** What users see for an unexpected error. The details stay in the logs. */
export function internalError(): ErrorBody {
	return { code: 'internal', message: m.error_internal() };
}
