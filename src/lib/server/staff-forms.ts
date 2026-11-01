import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	staffCreateFormSchema,
	staffFormSchema,
	type StaffMessage
} from '#lib/schemas/staff.schema.js';
import { failForm } from '#lib/server/errors.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	createStaff,
	updateStaff,
	type StaffCreateExtras,
	type StaffInput
} from '#lib/server/services/staff.js';
import type { ProfilePerson } from '#lib/types/profile.js';
import { personName } from '#lib/utils/locale.js';

// The staff forms: `/employees/new` creates with `staffCreateFormSchema` (create plan C1–C3), the
// profile header's "Edit details" sheet edits with `staffFormSchema` (redesign plan V7). The edited
// person comes from the page, never from the form.

const ids = { create: 'staff', edit: 'staff-edit' } as const;

type StaffFormData = Infer<typeof staffFormSchema>;
type StaffCreateData = Infer<typeof staffCreateFormSchema>;

/** An empty create form (no errors shown until the first submit). */
export function newStaffForm() {
	return superValidate(zod4(staffCreateFormSchema), { id: ids.create, errors: false });
}

/** The edit form, holding the person's current values. */
export function editStaffForm(person: ProfilePerson) {
	return superValidate(
		{
			staffId: person.id,
			employeeNo: person.employeeNo,
			firstNameEn: person.firstNameEn ?? '',
			lastNameEn: person.lastNameEn ?? '',
			firstNameAr: person.firstNameAr ?? '',
			lastNameAr: person.lastNameAr ?? '',
			fullName: person.fullName,
			fullNameAr: person.fullNameAr ?? '',
			jobTitleId: person.jobTitleId ?? '',
			phone: person.phone ?? '',
			workEmail: person.workEmail ?? '',
			startDate: person.startDate ?? '',
			functionId: person.functionId ?? '',
			departmentId: person.departmentId ?? '',
			teamId: person.teamId ?? ''
		},
		zod4(staffFormSchema),
		{ id: ids.edit, errors: false }
	);
}

function staffInput(data: Omit<StaffFormData, 'staffId' | 'fullName' | 'fullNameAr'> & {
	fullName?: string;
	fullNameAr?: string;
}): StaffInput {
	return {
		employeeNo: data.employeeNo || null,
		firstNameEn: data.firstNameEn || null,
		lastNameEn: data.lastNameEn || null,
		firstNameAr: data.firstNameAr || null,
		lastNameAr: data.lastNameAr || null,
		fullName: data.fullName || null,
		fullNameAr: data.fullNameAr || null,
		jobTitleId: data.jobTitleId || null,
		phone: data.phone || null,
		functionId: data.functionId || null,
		departmentId: data.departmentId || null,
		workEmail: data.workEmail || null,
		startDate: data.startDate || null,
		teamId: data.teamId || null
	};
}

function createExtras(data: StaffCreateData): StaffCreateExtras {
	return {
		fatherNameEn: data.fatherNameEn || null,
		fatherNameAr: data.fatherNameAr || null,
		motherNameEn: data.motherNameEn || null,
		motherNameAr: data.motherNameAr || null,
		nationalIdNo: data.nationalIdNo || null,
		nationalIdIssuedOn: data.nationalIdIssuedOn || null,
		nationalIdExpiresOn: data.nationalIdExpiresOn || null,
		passportNo: data.passportNo || null,
		personalEmail: data.personalEmail || null
	};
}

/** Create a person; the message carries the new id so the page can open the profile. */
export async function createStaffAction(request: Request, actor: Actor) {
	const form = await superValidate<StaffCreateData, StaffMessage>(
		request,
		zod4(staffCreateFormSchema),
		{ id: ids.create }
	);
	if (!form.valid) return fail(400, { form });
	try {
		const row = await createStaff(actor, staffInput(form.data), createExtras(form.data));
		return message(form, {
			kind: 'success',
			text: m.staff_created({ name: personName(row) }),
			staffId: row.id
		} satisfies StaffMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}

/** Save the page's person (`staffId` from the route, not from the posted form). */
export async function updateStaffAction(request: Request, actor: Actor, staffId: string) {
	const form = await superValidate<StaffFormData, StaffMessage>(request, zod4(staffFormSchema), {
		id: ids.edit
	});
	if (!form.valid) return fail(400, { form });
	try {
		const row = await updateStaff(actor, staffId, staffInput(form.data));
		return message(form, {
			kind: 'success',
			text: m.staff_updated({ name: personName(row) }),
			staffId: row.id
		} satisfies StaffMessage);
	} catch (cause) {
		return failForm(form, cause);
	}
}
