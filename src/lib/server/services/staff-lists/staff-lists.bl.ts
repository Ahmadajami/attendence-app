import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, NotFoundError } from '#lib/server/errors.js';
import type { StaffListInput, StaffListKind } from '#lib/schemas/staff-lists.schema.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import {
	findItem,
	insertItem,
	listCustodyItemTypes,
	listDocumentTypes,
	listJobTitles,
	listSkills,
	updateItem,
	type StaffListItem
} from './staff-lists.crud.js';

export type { StaffListItem } from './staff-lists.crud.js';

// Job titles, skills, document types and custody item types (profile plan H4–H6, H11), managed on
// `/staff-lists`. Items are deactivated, never deleted (H10); people keep a deactivated item they
// already have.

async function requireItem(kind: StaffListKind, id: string): Promise<StaffListItem> {
	const row = await findItem(kind, id);
	if (!row) throw new NotFoundError(m.staff_lists_error_not_found());
	return row;
}

function duplicateName(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) !== '23505') return undefined;
	return new ConflictError('duplicate_name', m.staff_lists_error_duplicate(), {
		field: 'nameEn',
		cause: error
	});
}

/** The four lists, active and inactive. */
export async function listStaffLists(actor: Actor) {
	requireActorPermission(actor, 'staff.write');
	const [jobTitles, skills, documentTypes, custodyItemTypes] = await Promise.all([
		listJobTitles(),
		listSkills(),
		listDocumentTypes(),
		listCustodyItemTypes()
	]);
	return { jobTitles, skills, documentTypes, custodyItemTypes };
}

export async function createStaffListItem(
	actor: Actor,
	kind: StaffListKind,
	input: StaffListInput
): Promise<StaffListItem> {
	requireActorPermission(actor, 'staff.write');
	const id = randomUUID();
	const values = { ...input, required: kind === 'document_type' && input.required };

	try {
		await batch([
			insertItem(kind, { id, ...values }),
			auditInsert({
				actor: actor.user,
				action: `${kind}.create`,
				entityType: kind,
				entityId: id,
				after: values
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}

	return { id, ...values, active: true };
}

export async function updateStaffListItem(
	actor: Actor,
	kind: StaffListKind,
	id: string,
	input: StaffListInput
): Promise<StaffListItem> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireItem(kind, id);
	const values = { ...input, required: kind === 'document_type' && input.required };

	try {
		await batch([
			updateItem(kind, id, values),
			auditInsert({
				actor: actor.user,
				action: `${kind}.update`,
				entityType: kind,
				entityId: id,
				before: { nameEn: before.nameEn, nameAr: before.nameAr, required: before.required },
				after: values
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}

	return { ...before, ...values };
}

export async function setStaffListItemActive(
	actor: Actor,
	kind: StaffListKind,
	id: string,
	active: boolean
): Promise<StaffListItem> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireItem(kind, id);
	if (before.active === active) return before;

	await batch([
		updateItem(kind, id, { active }),
		auditInsert({
			actor: actor.user,
			action: active ? `${kind}.activate` : `${kind}.deactivate`,
			entityType: kind,
			entityId: id,
			before: { active: before.active },
			after: { active }
		})
	]);

	return { ...before, active };
}
