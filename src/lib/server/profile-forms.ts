import { fail } from '@sveltejs/kit';
import { message, superValidate, type Infer, type SuperValidated } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	contactFormSchema,
	custodyFormSchema,
	documentFormSchema,
	experienceFormSchema,
	profileIdentityFormSchema,
	profileNamesFormSchema,
	removeProfileItemSchema,
	skillFormSchema,
	socialFormSchema,
	type ProfileMessage
} from '#lib/schemas/staff-profile.schema.js';
import { failForm, failNotice } from '#lib/server/errors.js';
import type { Actor } from '#lib/server/services/common.js';
import {
	removeProfileItem,
	saveContact,
	saveCustodyItem,
	saveExperience,
	saveSocialAccount,
	saveStaffSkill,
	setProfileIdentity,
	setProfileNames,
	setStaffDocument
} from '#lib/server/services/staff-profile/staff-profile.bl.js';
import type { ProfilePerson } from '#lib/types/profile.js';

// The employee profile forms (plan 2026-11-01-employee-profile, 4.2). The page loads them and calls
// these from its actions; the person comes from the page, never from the posted form.

const ids = {
	names: 'profile-names',
	identity: 'profile-identity',
	contact: 'profile-contact',
	experience: 'profile-experience',
	skill: 'profile-skill',
	social: 'profile-social',
	document: 'profile-document',
	custody: 'profile-custody'
} as const;

/** The names form holds the person's current values; the others start empty. */
export async function profileForms(person: ProfilePerson) {
	return {
		namesForm: await superValidate(
			{
				firstNameEn: person.firstNameEn ?? '',
				lastNameEn: person.lastNameEn ?? '',
				firstNameAr: person.firstNameAr ?? '',
				lastNameAr: person.lastNameAr ?? '',
				jobTitleId: person.jobTitleId ?? '',
				personalEmail: person.personalEmail ?? ''
			},
			zod4(profileNamesFormSchema),
			{ id: ids.names, errors: false }
		),
		identityForm: await superValidate(
			{
				fatherNameEn: person.fatherNameEn ?? '',
				fatherNameAr: person.fatherNameAr ?? '',
				motherNameEn: person.motherNameEn ?? '',
				motherNameAr: person.motherNameAr ?? '',
				nationalIdNo: person.nationalIdNo ?? '',
				nationalIdIssuedOn: person.nationalIdIssuedOn ?? '',
				nationalIdExpiresOn: person.nationalIdExpiresOn ?? '',
				passportNo: person.passportNo ?? ''
			},
			zod4(profileIdentityFormSchema),
			{ id: ids.identity, errors: false }
		),
		contactForm: await superValidate(zod4(contactFormSchema), { id: ids.contact }),
		experienceForm: await superValidate(zod4(experienceFormSchema), { id: ids.experience }),
		skillForm: await superValidate(zod4(skillFormSchema), { id: ids.skill }),
		socialForm: await superValidate(zod4(socialFormSchema), { id: ids.social }),
		documentForm: await superValidate(zod4(documentFormSchema), { id: ids.document }),
		custodyForm: await superValidate(zod4(custodyFormSchema), { id: ids.custody })
	};
}

type Result<S> = SuperValidated<S & Record<string, unknown>, ProfileMessage>;

function saved(form: Result<Record<string, unknown>>) {
	return message(form, { kind: 'success', text: m.profile_saved() } satisfies ProfileMessage);
}

const orNull = (value: string) => value || null;

export async function namesAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof profileNamesFormSchema>> = await superValidate(
		request,
		zod4(profileNamesFormSchema),
		{ id: ids.names }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await setProfileNames(actor, staffId, {
			firstNameEn: orNull(form.data.firstNameEn),
			lastNameEn: orNull(form.data.lastNameEn),
			firstNameAr: orNull(form.data.firstNameAr),
			lastNameAr: orNull(form.data.lastNameAr),
			jobTitleId: orNull(form.data.jobTitleId),
			personalEmail: orNull(form.data.personalEmail)
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function identityAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof profileIdentityFormSchema>> = await superValidate(
		request,
		zod4(profileIdentityFormSchema),
		{ id: ids.identity }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await setProfileIdentity(actor, staffId, {
			fatherNameEn: orNull(form.data.fatherNameEn),
			fatherNameAr: orNull(form.data.fatherNameAr),
			motherNameEn: orNull(form.data.motherNameEn),
			motherNameAr: orNull(form.data.motherNameAr),
			nationalIdNo: orNull(form.data.nationalIdNo),
			nationalIdIssuedOn: orNull(form.data.nationalIdIssuedOn),
			nationalIdExpiresOn: orNull(form.data.nationalIdExpiresOn),
			passportNo: orNull(form.data.passportNo)
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function contactAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof contactFormSchema>> = await superValidate(
		request,
		zod4(contactFormSchema),
		{ id: ids.contact }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await saveContact(actor, staffId, orNull(form.data.contactId), {
			name: form.data.name,
			relationship: form.data.relationship,
			phone: form.data.phone,
			phone2: orNull(form.data.phone2)
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function experienceAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof experienceFormSchema>> = await superValidate(
		request,
		zod4(experienceFormSchema),
		{ id: ids.experience }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await saveExperience(actor, staffId, orNull(form.data.experienceId), {
			employer: form.data.employer,
			jobTitle: form.data.jobTitle,
			startedOn: form.data.startedOn,
			endedOn: orNull(form.data.endedOn),
			note: orNull(form.data.note)
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function skillAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof skillFormSchema>> = await superValidate(
		request,
		zod4(skillFormSchema),
		{ id: ids.skill }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await saveStaffSkill(actor, staffId, orNull(form.data.staffSkillId), {
			skillId: form.data.skillId,
			level: form.data.level ? Number(form.data.level) : null
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function socialAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof socialFormSchema>> = await superValidate(
		request,
		zod4(socialFormSchema),
		{ id: ids.social }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await saveSocialAccount(actor, staffId, orNull(form.data.socialId), {
			platform: form.data.platform,
			handle: form.data.handle
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function documentAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof documentFormSchema>> = await superValidate(
		request,
		zod4(documentFormSchema),
		{ id: ids.document }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await setStaffDocument(actor, staffId, {
			documentTypeId: form.data.documentTypeId,
			received: form.data.received,
			receivedOn: orNull(form.data.receivedOn),
			referenceNo: orNull(form.data.referenceNo),
			expiresOn: orNull(form.data.expiresOn),
			note: orNull(form.data.note)
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

export async function custodyAction(request: Request, actor: Actor, staffId: string) {
	const form: Result<Infer<typeof custodyFormSchema>> = await superValidate(
		request,
		zod4(custodyFormSchema),
		{ id: ids.custody }
	);
	if (!form.valid) return fail(400, { form });
	try {
		await saveCustodyItem(actor, staffId, orNull(form.data.custodyId), {
			itemTypeId: form.data.itemTypeId,
			identifier: orNull(form.data.identifier),
			issuedOn: form.data.issuedOn,
			status: form.data.status,
			statusOn: orNull(form.data.statusOn),
			note: orNull(form.data.note)
		});
		return saved(form);
	} catch (cause) {
		return failForm(form, cause);
	}
}

/** Plain action (`{ notice }`): soft-remove one contact, job, skill or social account. */
export async function removeItemAction(request: Request, actor: Actor, staffId: string) {
	const parsed = removeProfileItemSchema.safeParse(Object.fromEntries(await request.formData()));
	if (!parsed.success) return fail(400, { notice: m.profile_error_item_not_found() });
	try {
		await removeProfileItem(actor, staffId, parsed.data.kind, parsed.data.itemId);
		return { notice: m.profile_removed() };
	} catch (cause) {
		return failNotice(cause);
	}
}
