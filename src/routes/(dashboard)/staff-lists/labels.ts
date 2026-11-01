import { m } from '#lib/paraglide/messages.js';
import type { StaffListKind } from '#lib/schemas/staff-lists.schema.js';

const TITLES: Record<StaffListKind, () => string> = {
	job_title: m.staff_lists_job_titles,
	skill: m.staff_lists_skills,
	document_type: m.staff_lists_document_types,
	custody_item_type: m.staff_lists_custody_item_types
};

/** The heading of one list. */
export function kindTitle(kind: StaffListKind): string {
	return TITLES[kind]();
}
