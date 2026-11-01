import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { toAsciiDigits } from '#lib/schemas/auth.schema.js';

// The employee profile forms (plan 2026-11-01-employee-profile, H1–H10). Empty strings are "not
// given"; the BL turns them into `null`.

const optionalId = z.union([z.literal(''), z.uuid()]).default('');
const optionalText = (max: number) => z.string().trim().max(max).default('');
const requiredText = (max: number, error: () => string) =>
	z.string().trim().min(1, { error }).max(max);
const optionalDate = z.union([z.literal(''), z.iso.date()]).default('');
const optionalEmail = z
	.union([z.literal(''), z.email({ error: () => m.staff_email_invalid() })])
	.default('');

/** The profile groups whose rows are removed (soft) one by one (H10). */
export const PROFILE_ITEM_KINDS = ['contact', 'experience', 'skill', 'social', 'custody'] as const;
export type ProfileItemKind = (typeof PROFILE_ITEM_KINDS)[number];

/** Platforms offered for a social account; `other` takes any handle or URL. */
export const SOCIAL_PLATFORMS = [
	'facebook',
	'instagram',
	'linkedin',
	'x',
	'telegram',
	'whatsapp',
	'tiktok',
	'other'
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** The condition of an item in a person's custody (H11). */
export const CUSTODY_STATUSES = ['with_employee', 'returned', 'lost', 'damaged'] as const;
export type CustodyStatus = (typeof CUSTODY_STATUSES)[number];

/** Skill levels 1–3; `''` = no level. */
export const SKILL_LEVELS = ['1', '2', '3'] as const;

/** Name parts, job title and personal email (H1, H6, H7). */
export const profileNamesFormSchema = z.object({
	firstNameEn: optionalText(60),
	lastNameEn: optionalText(60),
	firstNameAr: optionalText(60),
	lastNameAr: optionalText(60),
	jobTitleId: optionalId,
	personalEmail: optionalEmail
});
export type ProfileNamesFormSchema = typeof profileNamesFormSchema;

/**
 * An ID or passport number: letters, digits and dashes; Arabic-Indic digits become ASCII. Shared
 * with the create form (`staff.schema.ts`), which requires the ID number.
 */
export const documentNumberSchema = z
	.string()
	.trim()
	.max(30)
	.overwrite(toAsciiDigits)
	.regex(/^[0-9A-Za-z-]*$/, { error: () => m.profile_document_number_invalid() });
const documentNumber = documentNumberSchema.default('');

/**
 * Parents' names and the ID card / passport (H13). The expiry not before the issue date is checked
 * by the BL (and the DB), not by a whole-object refine.
 */
export const profileIdentityFormSchema = z.object({
	fatherNameEn: optionalText(60),
	fatherNameAr: optionalText(60),
	motherNameEn: optionalText(60),
	motherNameAr: optionalText(60),
	nationalIdNo: documentNumber,
	nationalIdIssuedOn: optionalDate,
	nationalIdExpiresOn: optionalDate,
	passportNo: documentNumber
});
export type ProfileIdentityFormSchema = typeof profileIdentityFormSchema;

/** An emergency contact (H2); `contactId` `''` adds one. */
export const contactFormSchema = z.object({
	contactId: optionalId,
	name: requiredText(120, () => m.profile_contact_name_required()),
	relationship: requiredText(60, () => m.profile_contact_relationship_required()),
	phone: requiredText(40, () => m.profile_contact_phone_required()),
	phone2: optionalText(40)
});
export type ContactFormSchema = typeof contactFormSchema;

/** An earlier job (H3); `experienceId` `''` adds one. */
export const experienceFormSchema = z
	.object({
		experienceId: optionalId,
		employer: requiredText(120, () => m.profile_experience_employer_required()),
		jobTitle: requiredText(120, () => m.profile_experience_job_title_required()),
		startedOn: z.iso.date({ error: () => m.profile_experience_started_required() }).default(''),
		endedOn: optionalDate,
		note: optionalText(500)
	})
	.refine((v) => !v.endedOn || !v.startedOn || v.endedOn >= v.startedOn, {
		error: () => m.profile_experience_dates_order(),
		path: ['endedOn']
	});
export type ExperienceFormSchema = typeof experienceFormSchema;

/** A skill and its optional level (H4); `staffSkillId` `''` adds one. */
export const skillFormSchema = z.object({
	staffSkillId: optionalId,
	skillId: z
		.string()
		.default('')
		.refine((value) => z.uuid().safeParse(value).success, {
			error: () => m.profile_skill_required()
		}),
	level: z.enum(['', ...SKILL_LEVELS]).default('')
});
export type SkillFormSchema = typeof skillFormSchema;

/** A social account (H7); `socialId` `''` adds one. */
export const socialFormSchema = z.object({
	socialId: optionalId,
	platform: z.enum(SOCIAL_PLATFORMS).default('' as 'facebook'),
	handle: requiredText(200, () => m.profile_social_handle_required())
});
export type SocialFormSchema = typeof socialFormSchema;

/** One document type's state for a person (H5). */
export const documentFormSchema = z
	.object({
		documentTypeId: z.uuid(),
		received: z.boolean().default(false),
		receivedOn: optionalDate,
		referenceNo: optionalText(80),
		expiresOn: optionalDate,
		note: optionalText(500)
	})
	.refine((v) => !v.received || v.receivedOn !== '', {
		error: () => m.profile_document_received_on_required(),
		path: ['receivedOn']
	});
export type DocumentFormSchema = typeof documentFormSchema;

/** An item in a person's custody (H11); `custodyId` `''` hands one out. */
export const custodyFormSchema = z
	.object({
		custodyId: optionalId,
		itemTypeId: z
			.string()
			.default('')
			.refine((value) => z.uuid().safeParse(value).success, {
				error: () => m.profile_custody_type_required()
			}),
		identifier: optionalText(120),
		issuedOn: z.iso.date({ error: () => m.profile_custody_issued_required() }).default(''),
		status: z.enum(CUSTODY_STATUSES).default('with_employee'),
		statusOn: optionalDate,
		note: optionalText(500)
	})
	.refine((v) => v.status === 'with_employee' || v.statusOn !== '', {
		error: () => m.profile_custody_status_on_required(),
		path: ['statusOn']
	})
	.refine((v) => !v.statusOn || !v.issuedOn || v.statusOn >= v.issuedOn, {
		error: () => m.profile_custody_dates_order(),
		path: ['statusOn']
	});
export type CustodyFormSchema = typeof custodyFormSchema;

/** Soft removal of one row of a profile group (plain action, `{ notice }`). */
export const removeProfileItemSchema = z.object({
	kind: z.enum(PROFILE_ITEM_KINDS),
	itemId: z.uuid()
});

/** The `{ kind, text }` status message of every profile form. */
export type ProfileMessage = { kind: 'success' | 'error'; text: string };
