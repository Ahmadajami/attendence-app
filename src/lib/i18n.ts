import { resolve } from '$app/paths';
import type { Path, ResolvedPathname } from '$app/types';
import { localizeHref, type Locale } from '#lib/paraglide/runtime.js';

/**
 * Every real URL path in the app with a leading slash, e.g. `/`, `/login`, `/flights/123`.
 * Route groups like `(app)` are not part of it.
 */
export type AppPath = `/${Path}`;

/**
 * Localized, type-checked href for an internal page: `localizeHref(resolve(url))`.
 *
 * `resolve()` checks the path exists and applies the base path, then `localizeHref()` adds the
 * locale prefix (current locale unless `locale` is given). Returns `ResolvedPathname` so
 * `<a href>` passes the `svelte/no-navigation-without-resolve` lint rule.
 *
 * @example localizedHref('/login')        // '/login' or '/ar/login'
 * @example localizedHref('/login', 'ar')  // '/ar/login'
 */
export function localizedHref(url: AppPath, locale?: Locale): ResolvedPathname;
export function localizedHref(
	url: AppPath,
	params: Record<string, string>,
	locale?: Locale
): ResolvedPathname;

export function localizedHref(
	url: AppPath,
	paramsOrLocale?: Record<string, string> | Locale,
	locale?: Locale
): ResolvedPathname {
	const params = typeof paramsOrLocale === 'object' ? paramsOrLocale : undefined;
	const targetLocale = typeof paramsOrLocale === 'string' ? paramsOrLocale : locale;
	const filled = params
		? url.replace(/\[([^\]]+)\]/g, (_, key: string) => encodeURIComponent(params[key] ?? ''))
		: url;
	const resolved = resolve(filled.slice(1) as Path);
	return localizeHref(resolved, { locale: targetLocale }) as ResolvedPathname;
}
