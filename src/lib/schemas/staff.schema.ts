import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { toAsciiDigits } from '#lib/schemas/auth.schema.js';

const optionalId = z.union([z.literal(''), z.uuid()]);

/** Add an employee (`/employees/new`) or edit one (profile header, redesign plan V7). */
export const staffFormSchema = z.object({
	staffId: optionalId.default(''),
	/** Empty on create = generate the next number (plan D28); empty on edit = keep it. */
	employeeNo: z
		.string()
		.trim()
		.regex(/^([0-9٠-٩۰-۹]+)?$/, { error: () => m.staff_employee_no_digits() })
		.overwrite(toAsciiDigits)
		.default(''),
	/**
	 * Name parts (profile plan H1): required for a new person (checked by the service), shown for
	 * someone who has them. The full names are edited only for a person without parts.
	 */
	firstNameEn: z.string().trim().max(60).default(''),
	lastNameEn: z.string().trim().max(60).default(''),
	firstNameAr: z.string().trim().max(60).default(''),
	lastNameAr: z.string().trim().max(60).default(''),
	fullName: z.string().trim().max(120).default(''),
	fullNameAr: z.string().trim().max(120).default(''),
	jobTitleId: optionalId.default(''),
	phone: z.string().trim().max(40).default(''),
	workEmail: z
		.union([z.literal(''), z.email({ error: () => m.staff_email_invalid() })])
		.default(''),
	startDate: z.union([z.literal(''), z.iso.date()]).default(''),
	functionId: optionalId.default(''),
	departmentId: optionalId.default(''),
	teamId: optionalId.default('')
});

export type StaffFormSchema = typeof staffFormSchema;

export const setStaffTeamSchema = z.object({
	staffId: z.uuid(),
	teamId: optionalId
});

export const setStaffActiveSchema = z.object({
	staffId: z.uuid(),
	active: z.enum(['true', 'false'])
});

/** `staffId` is the saved person (a new one's profile opens after the save). */
export type StaffMessage = { kind: 'success' | 'error'; text: string; staffId?: string };
