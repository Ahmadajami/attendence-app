import { toast } from 'svelte-sonner';
import type { SubmitFunction } from '$app/forms';

/**
 * `use:enhance` callback for plain actions that return `{ notice }` (success) or
 * `fail(status, { notice })` (`failNotice`): toasts the notice, then updates the page.
 */
export const toastNotice: SubmitFunction = () => {
	return async ({ result, update }) => {
		if (result.type === 'success' || result.type === 'failure') {
			const notice = result.data?.notice;
			if (typeof notice === 'string') {
				if (result.type === 'success') toast.success(notice);
				else toast.error(notice);
			}
		} else if (result.type === 'error') {
			toast.error(result.error.message);
		}
		await update();
	};
};
