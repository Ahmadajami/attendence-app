import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

const optionalId = z.union([z.literal(''), z.uuid()]);

export const departmentFormSchema = z.object({
	departmentId: optionalId.default(''),
	nameEn: z
		.string()
		.trim()
		.min(1, { error: () => m.departments_name_required() })
		.max(120),
	nameAr: z
		.string()
		.trim()
		.min(1, { error: () => m.departments_name_required() })
		.max(120),
	/** '' = top level. */
	parentId: optionalId.default(''),
	/** '' = no manager. */
	managerStaffId: optionalId.default('')
});
export type DepartmentFormSchema = typeof departmentFormSchema;

/** The departments service's create / update input. */
export type DepartmentInput = {
	nameEn: string;
	nameAr: string;
	parentId: string | null;
	managerStaffId: string | null;
};

export const setDepartmentActiveSchema = z.object({
	departmentId: z.uuid(),
	active: z.enum(['true', 'false'])
});

/** Superforms status message for the create / edit sheet. */
export type DepartmentMessage = { kind: 'success' | 'error'; text: string };
