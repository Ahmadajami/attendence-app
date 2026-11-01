import { getContext, setContext } from 'svelte';
import type { StaffListKind } from '#lib/schemas/staff-lists.schema.js';
import type { StaffListOption } from '#lib/types/profile.js';

/**
 * What `StaffListsHost` offers the pickers and buttons below it. One host per page owns the only
 * `ListItemSheet` (all pickers share the superform id `staff-list`) and the "Manage …" sheet.
 */
export type StaffListsApi = {
	/** Open the create sheet; `onSaved` gets the new item. */
	create: (kind: StaffListKind, onSaved?: (item: StaffListOption) => void) => void;
	/** Open the "Manage …" sheet of one list. */
	manage: (kind: StaffListKind) => void;
};

const KEY = Symbol('staff-lists');

export function setStaffLists(api: StaffListsApi): void {
	setContext(KEY, api);
}

export function getStaffLists(): StaffListsApi {
	const api = getContext<StaffListsApi | undefined>(KEY);
	if (!api) throw new Error('getStaffLists() needs a StaffListsHost above it');
	return api;
}
