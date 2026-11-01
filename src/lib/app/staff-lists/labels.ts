import { m } from '#lib/paraglide/messages.js';
import type { StaffListKind } from '#lib/schemas/staff-lists.schema.js';

const TITLES: Record<StaffListKind, () => string> = {
	job_title: m.staff_lists_job_titles,
	skill: m.staff_lists_skills,
	document_type: m.staff_lists_document_types,
	custody_item_type: m.staff_lists_custody_item_types
};

const NEW_LABELS: Record<StaffListKind, () => string> = {
	job_title: m.staff_lists_new_job_title,
	skill: m.staff_lists_new_skill,
	document_type: m.staff_lists_new_document_type,
	custody_item_type: m.staff_lists_new_custody_item_type
};

const MANAGE_LABELS: Record<StaffListKind, () => string> = {
	job_title: m.staff_lists_manage_job_title,
	skill: m.staff_lists_manage_skill,
	document_type: m.staff_lists_manage_document_type,
	custody_item_type: m.staff_lists_manage_custody_item_type
};

/** The heading of one list ("Job titles"). */
export function kindTitle(kind: StaffListKind): string {
	return TITLES[kind]();
}

/** "New job title": the last item of a picker, and the create sheet's title. */
export function newItemLabel(kind: StaffListKind): string {
	return NEW_LABELS[kind]();
}

/** "Manage job titles": the button that opens the list's sheet. */
export function manageLabel(kind: StaffListKind): string {
	return MANAGE_LABELS[kind]();
}
