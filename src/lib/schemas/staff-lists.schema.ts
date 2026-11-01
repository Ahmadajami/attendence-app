import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

/** The lists HR manages on `/staff-lists` (profile plan H4–H6, H11). */
export const STAFF_LIST_KINDS = [
	'job_title',
	'skill',
	'document_type',
	'custody_item_type'
] as const;
export type StaffListKind = (typeof STAFF_LIST_KINDS)[number];

export const staffListFormSchema = z.object({
	kind: z.enum(STAFF_LIST_KINDS).default('job_title'),
	/** `''` creates an item. */
	itemId: z.union([z.literal(''), z.uuid()]).default(''),
	nameEn: z
		.string()
		.trim()
		.min(1, { error: () => m.staff_lists_name_required() })
		.max(120),
	nameAr: z
		.string()
		.trim()
		.min(1, { error: () => m.staff_lists_name_required() })
		.max(120),
	/** Document types only; ignored for the other kinds. */
	required: z.boolean().default(false)
});
export type StaffListFormSchema = typeof staffListFormSchema;

/** The staff-lists service's create / edit input. */
export type StaffListInput = { nameEn: string; nameAr: string; required: boolean };

export const setStaffListActiveSchema = z.object({
	kind: z.enum(STAFF_LIST_KINDS),
	itemId: z.uuid(),
	active: z.enum(['true', 'false'])
});

/** Superforms status message for the create / edit sheet. */
export type StaffListMessage = { kind: 'success' | 'error'; text: string };
