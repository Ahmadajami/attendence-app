// Single-user local mode (plan D17): no sign-in, so the app must only ever answer this machine.
// Pure helpers, no `$app/*` imports, so they are unit-tested in Node.

export const AUTH_MODES = ['login', 'local_single_user'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** True for an IPv4/IPv6 loopback client address (`127.0.0.0/8`, `::1`, IPv4-mapped `::ffff:127.x`). */
export function isLoopbackAddress(address: string): boolean {
	const value = address.trim().toLowerCase();
	if (value === '::1') return true;
	const v4 = value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value;
	const parts = v4.split('.');
	if (parts.length !== 4 || parts[0] !== '127') return false;
	return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** True for a bind address that only listens on loopback. `localhost` is not trusted (DNS). */
export function isLoopbackBindHost(host: string | undefined): boolean {
	return host !== undefined && (host === '::1' || isLoopbackAddress(host));
}

/**
 * Why the server must not start in local mode, or `null` when the setup is safe. Production
 * (`adapter-node`) listens on `HOST`, which defaults to 0.0.0.0; `ADDRESS_HEADER` / `XFF_DEPTH`
 * would let a request choose its own client address.
 */
export function localModeStartupProblem(env: Record<string, string | undefined>): string | null {
	if (!isLoopbackBindHost(env.HOST)) {
		return 'AUTH_MODE=local_single_user needs HOST=127.0.0.1 (the app has no sign-in in this mode).';
	}
	if (env.ADDRESS_HEADER || env.XFF_DEPTH) {
		return 'AUTH_MODE=local_single_user cannot trust ADDRESS_HEADER / XFF_DEPTH; unset them.';
	}
	return null;
}
