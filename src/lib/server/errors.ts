import { fail } from '@sveltejs/kit';
import {
	message,
	setError,
	type FormPathLeavesWithErrors,
	type SuperValidated
} from 'sveltekit-superforms';
import { m } from '#lib/paraglide/messages.js';

/** The statuses services use. All are valid Superforms error statuses. */
export type AppErrorStatus = 400 | 403 | 404 | 409 | 413;

type AppErrorOptions = {
	/** Input field at fault (the service input's key, which matches the form's). */
	field?: string;
	cause?: unknown;
};

/**
 * An expected failure: an HTTP status, a stable `code` for API clients, and a localized message
 * that is safe to show. Services throw these, never a plain `Error` or a silent `null`.
 *
 * - In a `load` or `+server.ts`: let it propagate. `handleError` (hooks.server.ts) turns it into
 *   its status and message, rendered by `+error.svelte` or returned as JSON.
 * - In an action: catch it and return `failForm(form, cause)` or `failNotice(cause)`.
 */
export class AppError extends Error {
	readonly field: string | undefined;

	constructor(
		readonly status: AppErrorStatus,
		readonly code: string,
		message: string,
		options: AppErrorOptions = {}
	) {
		super(message, { cause: options.cause });
		this.name = new.target.name;
		this.field = options.field;
	}
}

export class InvalidInputError extends AppError {
	constructor(code: string, message: string, options?: AppErrorOptions) {
		super(400, code, message, options);
	}
}

export class ForbiddenError extends AppError {
	constructor() {
		super(403, 'forbidden', m.auth_forbidden());
	}
}

export class NotFoundError extends AppError {
	constructor(message: string, code = 'not_found') {
		super(404, code, message);
	}
}

/** A uniqueness or overlap rule (SQLSTATE `23505` / `23P01`) or a state that blocks the change. */
export class ConflictError extends AppError {
	constructor(code: string, message: string, options?: AppErrorOptions) {
		super(409, code, message, options);
	}
}

/** The error variant every page's Superforms status message has. */
type ErrorMessage = { kind: 'error'; text: string };

/**
 * Catch block of a Superforms action. An `AppError` becomes a field error when the form has its
 * `field`, otherwise an error status message (the form's `onUpdated` toasts it). Anything else is
 * a bug and rethrows to `handleError` as a 500.
 */
export function failForm<T extends Record<string, unknown>, M>(
	form: SuperValidated<T, M | ErrorMessage>,
	cause: unknown
) {
	if (!(cause instanceof AppError)) throw cause;
	if (cause.field && cause.field in form.data) {
		const field = cause.field as FormPathLeavesWithErrors<T>;
		return setError(form, field, cause.message, { status: cause.status });
	}
	return message(form, { kind: 'error', text: cause.message }, { status: cause.status });
}

/**
 * Catch block of a plain action (no Superforms) whose page toasts `result.data.notice`.
 * Anything that isn't an `AppError` rethrows to `handleError` as a 500.
 */
export function failNotice(cause: unknown) {
	if (!(cause instanceof AppError)) throw cause;
	return fail(cause.status, { notice: cause.message });
}
