import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import {
	CODE_VALIDITY_HOURS,
	DEFAULT_CODE_VALIDITY_HOURS,
	ID_DIGITS,
	toAsciiDigits
} from '#lib/schemas/auth.schema.js';

// Select values are strings; the action converts them back to hours.
const VALIDITY = CODE_VALIDITY_HOURS.map(String) as ['24', '168', '720'];
const validity = z.enum(VALIDITY).default(String(DEFAULT_CODE_VALIDITY_HOURS) as '168');

// The role is checked against the assignable roles on the server (the list lives in #lib/server).
const roleKey = z.string().min(1, { error: () => m.users_error_role() });

export const createAccountSchema = z.object({
	loginId: z
		.string()
		.trim()
		.min(1, { error: () => m.login_id_required(), abort: true })
		.regex(ID_DIGITS, { error: () => m.login_id_digits() })
		.overwrite(toAsciiDigits),
	fullName: z
		.string()
		.trim()
		.min(1, { error: () => m.users_full_name_required() })
		.max(120),
	fullNameAr: z.string().trim().max(120).default(''),
	role: roleKey.default('operations_manager'),
	validity
});

export const issueCodeSchema = z.object({ userId: z.uuid(), validity });

export const changeRoleSchema = z.object({ userId: z.uuid(), role: roleKey });

export const setActiveSchema = z.object({ userId: z.uuid(), active: z.enum(['true', 'false']) });

/** Superforms status message: a code to show once, or a notice for a toast. */
export type UsersMessage =
	| { kind: 'issued'; fullName: string; loginId: string; code: string; expiresAt: string }
	| { kind: 'success' | 'error'; text: string };
