import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

// Two-level management (plans/2026-11-01-two-level-management.md, task 3.1): change a
// department's manager from a date (M3). Dates are `yyyy-mm-dd` strings; today or later (Q-M5).

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });

export const departmentManagerFormSchema = z.object({
	departmentId: z.uuid({ error: () => m.departments_error_not_found() }),
	/** '' = no manager from `validFrom` (the department is then covered from above, M2). */
	staffId: z.union([z.literal(''), z.uuid()]).default(''),
	validFrom: isoDate,
	reason: z
		.string()
		.trim()
		.min(1, { error: () => m.roster_reason_required() })
		.max(500)
});
export type DepartmentManagerFormSchema = typeof departmentManagerFormSchema;

/** The management service's input for a manager change. */
export type DepartmentManagerInput = {
	departmentId: string;
	/** `null` = no manager from `validFrom`. */
	staffId: string | null;
	validFrom: string;
	reason: string;
};

/** Superforms status message for the change-manager sheet. */
export type DepartmentManagerMessage = { kind: 'success' | 'error'; text: string };
