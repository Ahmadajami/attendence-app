import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { ID_DIGITS, toAsciiDigits } from '#lib/schemas/auth.schema.js';

const optionalId = z.union([z.literal(''), z.uuid()]);

export const staffFormSchema = z.object({
	staffId: optionalId.default(''),
	employeeNo: z
		.string()
		.trim()
		.min(1, { error: () => m.staff_employee_no_required(), abort: true })
		.regex(ID_DIGITS, { error: () => m.staff_employee_no_digits() })
		.overwrite(toAsciiDigits),
	fullName: z
		.string()
		.trim()
		.min(1, { error: () => m.staff_name_required() })
		.max(120),
	fullNameAr: z.string().trim().max(120).default(''),
	phone: z.string().trim().max(40).default(''),
	functionId: z.uuid({ error: () => m.staff_error_function() }),
	teamId: optionalId.default('')
});

export const setStaffTeamSchema = z.object({
	staffId: z.uuid(),
	teamId: optionalId
});

export const setStaffActiveSchema = z.object({
	staffId: z.uuid(),
	active: z.enum(['true', 'false'])
});

export type StaffMessage = { kind: 'success' | 'error'; text: string };
