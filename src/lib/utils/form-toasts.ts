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
