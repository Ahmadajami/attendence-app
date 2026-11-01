import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { toAsciiDigits } from '#lib/schemas/auth.schema.js';
import { documentNumberSchema } from '#lib/schemas/staff-profile.schema.js';

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

const required = () => m.staff_create_field_required();
const requiredName = z.string().trim().min(1, { error: required }).max(60);
const optionalName = z.string().trim().max(60).default('');
const optionalDate = z.union([z.literal(''), z.iso.date()]).default('');

/**
 * Add an employee (`/employees/new`, create plan C2): names in both languages, the start date and
 * the ID number are required (marked *); everything else is optional. Editing keeps
 * `staffFormSchema` (C4: these rules apply on create only). The BL checks the same rules.
 */
export const staffCreateFormSchema = z.object({
	employeeNo: staffFormSchema.shape.employeeNo,
	firstNameEn: requiredName,
	lastNameEn: requiredName,
	firstNameAr: requiredName,
	lastNameAr: requiredName,
	fatherNameEn: optionalName,
	fatherNameAr: optionalName,
	motherNameEn: optionalName,
	motherNameAr: optionalName,
	nationalIdNo: documentNumberSchema.min(1, { error: required }),
	nationalIdIssuedOn: optionalDate,
	nationalIdExpiresOn: optionalDate,
	passportNo: documentNumberSchema.default(''),
	jobTitleId: optionalId.default(''),
	departmentId: optionalId.default(''),
	functionId: optionalId.default(''),
	teamId: optionalId.default(''),
	startDate: z.iso.date({ error: required }),
	phone: staffFormSchema.shape.phone,
	workEmail: staffFormSchema.shape.workEmail,
	personalEmail: staffFormSchema.shape.workEmail
});

export type StaffCreateFormSchema = typeof staffCreateFormSchema;

/** The create form's required fields, in page order (the "Required fields" checklist). */
export const STAFF_CREATE_REQUIRED = [
	'firstNameEn',
	'lastNameEn',
	'firstNameAr',
	'lastNameAr',
	'nationalIdNo',
	'startDate'
] as const;
export type StaffCreateRequiredField = (typeof STAFF_CREATE_REQUIRED)[number];

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
