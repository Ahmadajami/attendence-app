// Shared helpers for the auth CLI scripts. They run outside SvelteKit (tsx), so they open their own
// DB client and must not import anything that needs `$app/*`.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
	CODE_VALIDITY_HOURS,
	DEFAULT_CODE_VALIDITY_HOURS,
	codeExpiresAt,
	generateCode,
	type CodeValidityHours
} from '../src/lib/server/auth/credentials.js';
import { hashPassword } from '../src/lib/server/auth/password.js';
import * as schema from '../src/lib/server/db/schema/index.js';

export function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

/** Same normalisation as the login form: Arabic-Indic digits → ASCII, digits only. */
export function parseLoginId(raw: string): string {
	const loginId = raw.trim().replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
	if (!/^[0-9]+$/.test(loginId)) fail(`loginId must contain digits only (got "${raw}").`);
	return loginId;
}

const DAY_CHOICES = CODE_VALIDITY_HOURS.map((hours) => hours / 24);

/** `--days 1|7|30` → validity in hours (default 7 days). */
export function parseValidity(days: string | undefined): CodeValidityHours {
	if (days === undefined) return DEFAULT_CODE_VALIDITY_HOURS;
	const hours = CODE_VALIDITY_HOURS.find((h) => h / 24 === Number(days));
	if (!hours) fail(`--days must be one of ${DAY_CHOICES.join(', ')} (got "${days}").`);
	return hours;
}

export function connect() {
	const url = process.env.DATABASE_URL;
	if (!url) fail('DATABASE_URL is not set.');
	return drizzle(neon(url), { schema });
}

/** A fresh code plus the columns that store it. The plain code is only ever printed once. */
export async function newCode(hours: CodeValidityHours) {
	const code = generateCode();
	const now = new Date();
	return {
		code,
		columns: {
			passwordHash: await hashPassword(code),
			passwordChangedAt: now,
			passwordExpiresAt: codeExpiresAt(hours, now),
			failedLoginCount: 0,
			lockedAt: null
		}
	};
}

export function printCode(heading: string, loginId: string, code: string, expiresAt: Date) {
	const damascus = new Intl.DateTimeFormat('en-GB', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Damascus'
	}).format(expiresAt);
	console.log(`
${heading}

  ID number:     ${loginId}
  Sign-in code:  ${code}
  Valid until:   ${damascus} (Damascus)

The code is shown only once. Sign in at /login with the ID number and this code.
`);
}

export { schema };
