import { toast } from 'svelte-sonner';
import type { FormOptions } from 'sveltekit-superforms';

type FormToastOptions = {
	/** Shown after a valid submit that returned no status message. */
	success?: () => string;
};

/**
 * Superforms lifecycle callbacks that surface the result as a toast.
 * Spread into `superForm()` options: `superForm(untrack(() => data), { ...formToasts() })`.
 *
 * `onUpdated` toasts the server's status message (error toast when the form is invalid,
 * e.g. `message(form, text, { status: 4xx/5xx })`). `onError` toasts thrown errors and must
 * always be present, or Superforms throws in the browser on an error result.
 */
export function formToasts<T extends Record<string, unknown>, M>(
	options: FormToastOptions = {}
): Pick<FormOptions<T, M>, 'onUpdated' | 'onError'> {
	return {
		onUpdated: ({ form }) => {
			if (form.message) {
				const text = String(form.message);
				if (form.valid) toast.success(text);
				else toast.error(text);
			} else if (form.valid && options.success) {
				toast.success(options.success());
			}
		},
		onError: ({ result }) => {
			toast.error(result.error.message);
		}
	};
}

/** The `{ kind, text }` status message most forms use (and `failForm` returns on an `AppError`). */
export type StatusMessage = { kind: 'success' | 'error'; text: string };

/**
 * Like `formToasts`, for forms whose status message is a `StatusMessage`. `onSuccess` runs after
 * the success toast (e.g. to close a sheet) and gets the message, for messages that carry more.
 */
export function statusToasts<
	T extends Record<string, unknown>,
	M extends StatusMessage = StatusMessage
>(onSuccess?: (message: M) => void): Pick<FormOptions<T, M>, 'onUpdated' | 'onError'> {
	return {
		onUpdated: ({ form }) => {
			if (form.message?.kind === 'success') {
				toast.success(form.message.text);
				onSuccess?.(form.message);
			} else if (form.message?.kind === 'error') {
				toast.error(form.message.text);
			}
		},
		onError: ({ result }) => {
			toast.error(result.error.message);
		}
	};
}
