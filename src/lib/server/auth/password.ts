import { hash, verify } from '@node-rs/argon2';

// Hashing for sign-in codes (the `password_hash` column). Argon2 makes each guess against a leaked
// table expensive, which matters for a 6-digit secret.

// OWASP baseline for Argon2id (19 MiB, 2 iterations, 1 lane). Argon2id is the library default.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	try {
		return await verify(passwordHash, password);
	} catch {
		// Malformed hash: treat as a failed match rather than a 500.
		return false;
	}
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn the same Argon2 time as a real check when the login ID doesn't exist (or is inactive), so
 * response timing doesn't reveal which employee IDs have accounts. Always resolves to `false`.
 */
export async function verifyDummyPassword(password: string): Promise<false> {
	dummyHash ??= hashPassword('dummy-password-for-timing');
	await verifyPassword(await dummyHash, password);
	return false;
}
