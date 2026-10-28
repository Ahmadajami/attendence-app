import type { HandleClientError } from '@sveltejs/kit/hooks';
import { frameworkError, internalError } from '#lib/errors.js';

/**
 * Errors thrown while navigating in the browser. Errors the server hook already shaped don't
 * come through here again. `App.Error.code` is required, so every branch sets one.
 */
export const handleError: HandleClientError = ({ kind, error }) => {
	if (kind === 'app') return error;
	if (kind === 'framework') return frameworkError(error.status, error.message);
	console.error(error);
	return internalError();
};
