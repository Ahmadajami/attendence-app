import { randomInt } from 'node:crypto';
import {
	CODE_LENGTH,
	DEFAULT_CODE_VALIDITY_HOURS,
	type CodeValidityHours
} from '#lib/schemas/auth.schema.js';

export {
	CODE_VALIDITY_HOURS,
	DEFAULT_CODE_VALIDITY_HOURS,
	type CodeValidityHours
} from '#lib/schemas/auth.schema.js';

// Credential policy (CLAUDE.md §8): every account signs in with a 6-digit code issued
// by an admin (or `pnpm auth:issue-code`). Codes expire, their holder can't change them, and too
// many consecutive wrong codes lock the account until a new code is issued.

/** Consecutive wrong codes before an account is locked (until a new code is issued). */
export const MAX_CONSECUTIVE_CODE_FAILURES = 5;

/** Uniformly random 6-digit code, leading zeros kept (`004217`). */
export function generateCode(): string {
	return randomInt(0, 10 ** CODE_LENGTH)
		.toString()
		.padStart(CODE_LENGTH, '0');
}

export function codeExpiresAt(
	hours: CodeValidityHours = DEFAULT_CODE_VALIDITY_HOURS,
	from: Date = new Date()
): Date {
	return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
