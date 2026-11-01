import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import type {
	CustodyStatus,
	ProfileItemKind,
	SocialPlatform
} from '#lib/schemas/staff-profile.schema.js';
import {
	custodySummary,
	documentSummary,
	experienceMonths,
	resolveNames,
	type NameParts
} from '#lib/workforce/profile.js';
import type { ProfileDocument, StaffProfile } from '#lib/types/profile.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import {
	listCustodyItemTypes,
	listDocumentTypes,
	listJobTitles,
	listSkills
} from '../staff-lists/staff-lists.crud.js';
import {
	findCustodyItemType,
	findJobTitle,
	findLiveItem,
	findProfilePerson,
	findSkill,
	insertContact,
	insertCustodyItem,
	insertExperience,
	insertSocialAccount,
	insertStaffSkill,
	listContacts,
	listCustodyItems,
	listExperience,
	listSocialAccounts,
	listStaffDocuments,
	listStaffSkills,
	nextContactPosition,
	removeItem,
	updateContact,
	updateCustodyItem,
	updateExperience,
	updateSocialAccount,
	updateStaffProfile,
	updateStaffSkill,
	upsertStaffDocument,
	type ProfilePersonRow
} from './staff-profile.crud.js';

// The employee profile (plan 2026-11-01-employee-profile): name parts, job title, personal email,
// emergency contacts, earlier jobs, skills, social accounts, documents and custody items.
// Everything but the job title is personal data (CLAUDE.md §1): it stays in this app, nothing goes
// to Odoo or exports (H8). `staff.write` until login brings a `staff.personal` key (S8). Every
// write is audited.

export type ProfileNamesInput = NameParts & {
	jobTitleId: string | null;
	personalEmail: string | null;
};
export type ContactInput = {
	name: string;
	relationship: string;
	phone: string;
	phone2: string | null;
};
export type ExperienceInput = {
	employer: string;
	jobTitle: string;
	startedOn: string;
	endedOn: string | null;
	note: string | null;
};
export type StaffSkillInput = { skillId: string; level: number | null };
export type SocialInput = { platform: SocialPlatform; handle: string };
export type CustodyInput = {
	itemTypeId: string;
	identifier: string | null;
	issuedOn: string;
	status: CustodyStatus;
	statusOn: string | null;
	note: string | null;
};
export type DocumentInput = {
	documentTypeId: string;
	received: boolean;
	receivedOn: string | null;
	referenceNo: string | null;
	expiresOn: string | null;
	note: string | null;
};

const ENTITY: Record<ProfileItemKind, string> = {
	contact: 'staff_emergency_contact',
	experience: 'staff_experience',
	skill: 'staff_skill',
	social: 'staff_social_account',
	custody: 'staff_custody_item'
};

async function requirePerson(staffId: string): Promise<ProfilePersonRow> {
	const row = await findProfilePerson(staffId);
	if (!row) throw new NotFoundError(m.staff_error_not_found());
	return row;
}

/** A live row of `kind` that belongs to `staffId`. */
async function requireItem(kind: ProfileItemKind, staffId: string, id: string) {
	const row = await findLiveItem(kind, id);
	if (!row || row.staffId !== staffId) throw new NotFoundError(m.profile_error_item_not_found());
	return row;
}

/**
 * Everything the employee page shows about the person, and the four lists (active and inactive)
 * for its pickers and "Manage …" sheets; the pickers offer the active items and the chosen one.
 */
export async function getStaffProfile(actor: Actor, staffId: string): Promise<StaffProfile> {
	requireActorPermission(actor, 'staff.write');
	const person = await requirePerson(staffId);
	const [
		contacts,
		experience,
		skills,
		socials,
		records,
		custody,
		jobTitles,
		skillList,
		documentTypes,
		custodyTypes
	] = await Promise.all([
		listContacts(staffId),
		listExperience(staffId),
		listStaffSkills(staffId),
		listSocialAccounts(staffId),
		listStaffDocuments(staffId),
		listCustodyItems(staffId),
		listJobTitles(),
		listSkills(),
		listDocumentTypes(),
		listCustodyItemTypes()
	]);

	const recordByType = new Map(records.map((row) => [row.documentTypeId, row]));
	const documents: ProfileDocument[] = documentTypes
		.filter((type) => type.active || recordByType.has(type.id))
		.map((type) => ({ type, record: recordByType.get(type.id) ?? null }));

	return {
		person,
		jobTitle: jobTitles.find((t) => t.id === person.jobTitleId) ?? null,
		contacts,
		experience,
		skills,
		socials,
		documents,
		custody,
		lists: {
			jobTitles,
			skills: skillList,
			documentTypes,
			custodyItemTypes: custodyTypes
		},
		summary: {
			experienceMonths: experienceMonths(experience, person.startDate, todayInDamascus()),
			documents: documentSummary(
				documentTypes,
				records.map(({ documentTypeId, received }) => ({ documentTypeId, received }))
			),
			custody: custodySummary(custody)
		}
	};
}

/** An active job title, or the one the person already has. */
export async function validateJobTitle(id: string | null, current: string | null): Promise<void> {
	if (!id || id === current) return;
	const row = await findJobTitle(id);
	if (!row?.active)
		throw new InvalidInputError('invalid_job_title', m.profile_error_job_title(), {
			field: 'jobTitleId'
		});
}

/**
 * Name parts, job title and personal email (H1, H6, H7). A language without parts keeps its full
 * name; with both parts the full name becomes "first last".
 */
export async function setProfileNames(
	actor: Actor,
	staffId: string,
	input: ProfileNamesInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	const before = await requirePerson(staffId);
	const names = resolveNames(input, before);
	if (!names.ok)
		throw new InvalidInputError('name_part_missing', m.profile_name_part_missing(), {
			field: names.field
		});
	await validateJobTitle(input.jobTitleId, before.jobTitleId);

	const values = {
		...names.parts,
		fullName: names.fullName ?? before.fullName,
		fullNameAr: names.fullNameAr,
		jobTitleId: input.jobTitleId,
		personalEmail: input.personalEmail
	};
	await batch([
		updateStaffProfile(staffId, values),
		auditInsert({
			actor: actor.user,
			action: 'staff.profile_names',
			entityType: 'staff',
			entityId: staffId,
			before: {
				firstNameEn: before.firstNameEn,
				lastNameEn: before.lastNameEn,
				firstNameAr: before.firstNameAr,
				lastNameAr: before.lastNameAr,
				fullName: before.fullName,
				fullNameAr: before.fullNameAr,
				jobTitleId: before.jobTitleId,
				personalEmail: before.personalEmail
			},
			after: values
		})
	]);
}

/** Add an emergency contact (`contactId` `null`) or change one (H2). */
export async function saveContact(
	actor: Actor,
	staffId: string,
	contactId: string | null,
	input: ContactInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	await requirePerson(staffId);

	if (contactId) {
		const before = await requireItem('contact', staffId, contactId);
		await batch([
			updateContact(contactId, input),
			auditInsert({
				actor: actor.user,
				action: 'staff_emergency_contact.update',
				entityType: ENTITY.contact,
				entityId: contactId,
				before,
				after: input
			})
		]);
		return;
	}

	const id = randomUUID();
	const values = { id, staffId, ...input, position: await nextContactPosition(staffId) };
	await batch([
		insertContact(values),
		auditInsert({
			actor: actor.user,
			action: 'staff_emergency_contact.create',
			entityType: ENTITY.contact,
			entityId: id,
			after: values
		})
	]);
}

/** Add an earlier job (`experienceId` `null`) or change one (H3). */
export async function saveExperience(
	actor: Actor,
	staffId: string,
	experienceId: string | null,
	input: ExperienceInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	await requirePerson(staffId);
	if (input.endedOn && input.endedOn < input.startedOn)
		throw new InvalidInputError('dates_order', m.profile_experience_dates_order(), {
			field: 'endedOn'
		});

	if (experienceId) {
		const before = await requireItem('experience', staffId, experienceId);
		await batch([
			updateExperience(experienceId, input),
			auditInsert({
				actor: actor.user,
				action: 'staff_experience.update',
				entityType: ENTITY.experience,
				entityId: experienceId,
				before,
				after: input
			})
		]);
		return;
	}

	const id = randomUUID();
	await batch([
		insertExperience({ id, staffId, ...input }),
		auditInsert({
			actor: actor.user,
			action: 'staff_experience.create',
			entityType: ENTITY.experience,
			entityId: id,
			after: { staffId, ...input }
		})
	]);
}

/** Give a person a skill (`staffSkillId` `null`) or change its level (H4). */
export async function saveStaffSkill(
	actor: Actor,
	staffId: string,
	staffSkillId: string | null,
	input: StaffSkillInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	await requirePerson(staffId);

	if (staffSkillId) {
		const before = await requireItem('skill', staffId, staffSkillId);
		// Changing the skill itself is a remove and an add; only the level changes here.
		const values = { level: input.level };
		await batch([
			updateStaffSkill(staffSkillId, values),
			auditInsert({
				actor: actor.user,
				action: 'staff_skill.update',
				entityType: ENTITY.skill,
				entityId: staffSkillId,
				before: { skillId: before.skillId, level: before.level },
				after: { skillId: before.skillId, ...values }
			})
		]);
		return;
	}

	const skill = await findSkill(input.skillId);
	if (!skill?.active)
		throw new InvalidInputError('invalid_skill', m.profile_error_skill(), { field: 'skillId' });

	const id = randomUUID();
	try {
		await batch([
			insertStaffSkill({ id, staffId, ...input }),
			auditInsert({
				actor: actor.user,
				action: 'staff_skill.create',
				entityType: ENTITY.skill,
				entityId: id,
				after: { staffId, ...input }
			})
		]);
	} catch (error) {
		if (pgErrorCode(error) !== '23505') throw error;
		throw new ConflictError('duplicate_skill', m.profile_error_skill_duplicate(), {
			field: 'skillId',
			cause: error
		});
	}
}

/** Add a social account (`socialId` `null`) or change one (H7). */
export async function saveSocialAccount(
	actor: Actor,
	staffId: string,
	socialId: string | null,
	input: SocialInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	await requirePerson(staffId);

	if (socialId) {
		const before = await requireItem('social', staffId, socialId);
		await batch([
			updateSocialAccount(socialId, input),
			auditInsert({
				actor: actor.user,
				action: 'staff_social_account.update',
				entityType: ENTITY.social,
				entityId: socialId,
				before,
				after: input
			})
		]);
		return;
	}

	const id = randomUUID();
	await batch([
		insertSocialAccount({ id, staffId, ...input }),
		auditInsert({
			actor: actor.user,
			action: 'staff_social_account.create',
			entityType: ENTITY.social,
			entityId: id,
			after: { staffId, ...input }
		})
	]);
}

/**
 * Hand an item to a person (`custodyId` `null`) or change one: its details or its condition
 * (H11). The audit log keeps every earlier status. Back with the employee clears the status date.
 */
export async function saveCustodyItem(
	actor: Actor,
	staffId: string,
	custodyId: string | null,
	input: CustodyInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	await requirePerson(staffId);
	const values = {
		...input,
		statusOn: input.status === 'with_employee' ? null : input.statusOn
	};
	if (values.status !== 'with_employee' && !values.statusOn)
		throw new InvalidInputError('status_on_missing', m.profile_custody_status_on_required(), {
			field: 'statusOn'
		});
	if (values.statusOn && values.statusOn < values.issuedOn)
		throw new InvalidInputError('dates_order', m.profile_custody_dates_order(), {
			field: 'statusOn'
		});

	const before = custodyId ? await requireItem('custody', staffId, custodyId) : null;
	// A type that has since been deactivated stays on the items that already use it.
	if (before?.itemTypeId !== values.itemTypeId) {
		const type = await findCustodyItemType(values.itemTypeId);
		if (!type?.active)
			throw new InvalidInputError('invalid_custody_type', m.profile_error_custody_type(), {
				field: 'itemTypeId'
			});
	}

	if (custodyId && before) {
		await batch([
			updateCustodyItem(custodyId, values),
			auditInsert({
				actor: actor.user,
				action:
					before.status === values.status
						? 'staff_custody_item.update'
						: 'staff_custody_item.set_status',
				entityType: ENTITY.custody,
				entityId: custodyId,
				before,
				after: values
			})
		]);
		return;
	}

	const id = randomUUID();
	await batch([
		insertCustodyItem({ id, staffId, ...values }),
		auditInsert({
			actor: actor.user,
			action: 'staff_custody_item.create',
			entityType: ENTITY.custody,
			entityId: id,
			after: { staffId, ...values }
		})
	]);
}

/** Record whether a paper was received, when, and its number (H5). Not received clears the date. */
export async function setStaffDocument(
	actor: Actor,
	staffId: string,
	input: DocumentInput
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	await requirePerson(staffId);
	const [types, records] = await Promise.all([listDocumentTypes(), listStaffDocuments(staffId)]);
	const before = records.find((r) => r.documentTypeId === input.documentTypeId) ?? null;
	const type = types.find((t) => t.id === input.documentTypeId);
	// An inactive type can still be updated for a person who already has a row for it.
	if (!type || (!type.active && !before))
		throw new InvalidInputError('invalid_document_type', m.profile_error_document_type());
	if (input.received && !input.receivedOn)
		throw new InvalidInputError('received_on_missing', m.profile_document_received_on_required(), {
			field: 'receivedOn'
		});

	const changes = {
		received: input.received,
		receivedOn: input.received ? input.receivedOn : null,
		referenceNo: input.referenceNo,
		expiresOn: input.expiresOn,
		note: input.note
	};
	const id = before?.id ?? randomUUID();
	await batch([
		upsertStaffDocument({ id, staffId, documentTypeId: input.documentTypeId }, changes),
		auditInsert({
			actor: actor.user,
			action: 'staff_document.set',
			entityType: 'staff_document',
			entityId: id,
			before,
			after: { staffId, documentTypeId: input.documentTypeId, ...changes }
		})
	]);
}

/** Soft-remove one contact, job, skill or social account (H10). */
export async function removeProfileItem(
	actor: Actor,
	staffId: string,
	kind: ProfileItemKind,
	itemId: string
): Promise<void> {
	requireActorPermission(actor, 'staff.write');
	const before = await requireItem(kind, staffId, itemId);
	await batch([
		removeItem(kind, itemId, actor.user.id),
		auditInsert({
			actor: actor.user,
			action: `${ENTITY[kind]}.remove`,
			entityType: ENTITY[kind],
			entityId: itemId,
			before,
			after: null
		})
	]);
}
