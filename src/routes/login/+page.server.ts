import { redirect } from '@sveltejs/kit';
import { fail, message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { localizedHref } from '#lib/i18n.js';
import { loginSchema } from '#lib/schemas/auth.schema.js';
import { LOGIN_FAILURE, authenticate } from '#lib/server/auth/login.js';
import { requestMeta, setSessionCookie } from '#lib/server/auth/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, localizedHref('/'));
	return { form: await superValidate(zod4(loginSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema));
		const { idNumber, password: code } = form.data;
		// Never send the code back to the browser.
		form.data.password = '';

		if (!form.valid) return fail(400, { form });

		const result = await authenticate(idNumber, code, 'web', requestMeta(event));
		if (!result.ok) {
			const failure = LOGIN_FAILURE[result.reason];
			return message(form, failure.text(), { status: failure.status });
		}

		setSessionCookie(event.cookies, result.token, result.expiresAt);
		redirect(303, localizedHref('/'));
	}
};
