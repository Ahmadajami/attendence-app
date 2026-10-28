import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { toAsciiDigits } from '#lib/schemas/auth.schema.js';

const optionalId = z.union([z.literal(''), z.uuid()]);

export const staffFormSchema = z.object({
	staffId: optionalId.default(''),
	/** Empty on create = generate the next number (plan D28); empty on edit = keep it. */
	employeeNo: z
		.string()
		.trim()
		.regex(/^([0-9٠-٩۰-۹]+)?$/, { error: () => m.staff_employee_no_digits() })
		.overwrite(toAsciiDigits)
		.default(''),
	fullName: z
		.string()
		.trim()
		.min(1, { error: () => m.staff_name_required() })
		.max(120),
	fullNameAr: z.string().trim().max(120).default(''),
	phone: z.string().trim().max(40).default(''),
	workEmail: z
		.union([z.literal(''), z.email({ error: () => m.staff_email_invalid() })])
		.default(''),
	startDate: z.union([z.literal(''), z.iso.date()]).default(''),
	functionId: optionalId.default(''),
	departmentId: optionalId.default(''),
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
