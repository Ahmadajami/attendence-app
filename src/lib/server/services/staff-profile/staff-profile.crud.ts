import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	custodyItemType,
	department,
	jobTitle,
	skill,
	staff,
	staffCustodyItem,
	staffDocument,
	staffEmergencyContact,
	staffExperience,
	staffSkill,
	staffSocialAccount,
	team
} from '#lib/server/db/schema/index.js';
import type { ProfileItemKind } from '#lib/schemas/staff-profile.schema.js';
import type { BatchQuery } from '../common.js';

export async function findProfilePerson(staffId: string) {
	const [row] = await db
		.select({
			id: staff.id,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			firstNameEn: staff.firstNameEn,
			lastNameEn: staff.lastNameEn,
			firstNameAr: staff.firstNameAr,
			lastNameAr: staff.lastNameAr,
			fatherNameEn: staff.fatherNameEn,
			fatherNameAr: staff.fatherNameAr,
			motherNameEn: staff.motherNameEn,
			motherNameAr: staff.motherNameAr,
			nationalIdNo: staff.nationalIdNo,
			nationalIdIssuedOn: staff.nationalIdIssuedOn,
			nationalIdExpiresOn: staff.nationalIdExpiresOn,
			passportNo: staff.passportNo,
			jobTitleId: staff.jobTitleId,
			personalEmail: staff.personalEmail,
			startDate: staff.startDate,
			employeeNo: staff.employeeNo,
			phone: staff.phone,
			workEmail: staff.workEmail,
			active: staff.active,
			functionId: staff.functionId,
			departmentId: staff.departmentId,
			departmentNameEn: department.nameEn,
			departmentNameAr: department.nameAr,
			teamId: staff.teamId,
			teamNameEn: team.nameEn,
			teamNameAr: team.nameAr
		})
		.from(staff)
		.leftJoin(department, eq(department.id, staff.departmentId))
		.leftJoin(team, eq(team.id, staff.teamId))
		.where(eq(staff.id, staffId))
		.limit(1);
	return row;
}

export type ProfilePersonRow = NonNullable<Awaited<ReturnType<typeof findProfilePerson>>>;

const contactColumns = {
	id: staffEmergencyContact.id,
	staffId: staffEmergencyContact.staffId,
	name: staffEmergencyContact.name,
	relationship: staffEmergencyContact.relationship,
	phone: staffEmergencyContact.phone,
	phone2: staffEmergencyContact.phone2,
	position: staffEmergencyContact.position
};

export async function listContacts(staffId: string) {
	return db
		.select(contactColumns)
		.from(staffEmergencyContact)
		.where(and(eq(staffEmergencyContact.staffId, staffId), isNull(staffEmergencyContact.removedAt)))
		.orderBy(asc(staffEmergencyContact.position), asc(staffEmergencyContact.createdAt));
}

export type ContactRow = Awaited<ReturnType<typeof listContacts>>[number];

const experienceColumns = {
	id: staffExperience.id,
	staffId: staffExperience.staffId,
	employer: staffExperience.employer,
	jobTitle: staffExperience.jobTitle,
	startedOn: staffExperience.startedOn,
	endedOn: staffExperience.endedOn,
	note: staffExperience.note
};

export async function listExperience(staffId: string) {
	return db
		.select(experienceColumns)
		.from(staffExperience)
		.where(and(eq(staffExperience.staffId, staffId), isNull(staffExperience.removedAt)))
		.orderBy(desc(staffExperience.startedOn));
}

export type ExperienceRow = Awaited<ReturnType<typeof listExperience>>[number];

const staffSkillColumns = {
	id: staffSkill.id,
	staffId: staffSkill.staffId,
	skillId: staffSkill.skillId,
	level: staffSkill.level,
	nameEn: skill.nameEn,
	nameAr: skill.nameAr
};

export async function listStaffSkills(staffId: string) {
	return db
		.select(staffSkillColumns)
		.from(staffSkill)
		.innerJoin(skill, eq(skill.id, staffSkill.skillId))
		.where(and(eq(staffSkill.staffId, staffId), isNull(staffSkill.removedAt)))
		.orderBy(asc(skill.nameEn));
}

export type StaffSkillRow = Awaited<ReturnType<typeof listStaffSkills>>[number];

const socialColumns = {
	id: staffSocialAccount.id,
	staffId: staffSocialAccount.staffId,
	platform: staffSocialAccount.platform,
	handle: staffSocialAccount.handle
};

export async function listSocialAccounts(staffId: string) {
	return db
		.select(socialColumns)
		.from(staffSocialAccount)
		.where(and(eq(staffSocialAccount.staffId, staffId), isNull(staffSocialAccount.removedAt)))
		.orderBy(asc(staffSocialAccount.createdAt));
}

export type SocialRow = Awaited<ReturnType<typeof listSocialAccounts>>[number];

const documentColumns = {
	id: staffDocument.id,
	documentTypeId: staffDocument.documentTypeId,
	received: staffDocument.received,
	receivedOn: staffDocument.receivedOn,
	referenceNo: staffDocument.referenceNo,
	expiresOn: staffDocument.expiresOn,
	note: staffDocument.note
};

export async function listStaffDocuments(staffId: string) {
	return db.select(documentColumns).from(staffDocument).where(eq(staffDocument.staffId, staffId));
}

export type StaffDocumentRow = Awaited<ReturnType<typeof listStaffDocuments>>[number];

const custodyColumns = {
	id: staffCustodyItem.id,
	staffId: staffCustodyItem.staffId,
	itemTypeId: staffCustodyItem.itemTypeId,
	identifier: staffCustodyItem.identifier,
	issuedOn: staffCustodyItem.issuedOn,
	status: staffCustodyItem.status,
	statusOn: staffCustodyItem.statusOn,
	note: staffCustodyItem.note,
	nameEn: custodyItemType.nameEn,
	nameAr: custodyItemType.nameAr
};

/** Items in a person's custody, the ones still with them first, then newest first. */
export async function listCustodyItems(staffId: string) {
	return db
		.select(custodyColumns)
		.from(staffCustodyItem)
		.innerJoin(custodyItemType, eq(custodyItemType.id, staffCustodyItem.itemTypeId))
		.where(and(eq(staffCustodyItem.staffId, staffId), isNull(staffCustodyItem.removedAt)))
		.orderBy(sql`${staffCustodyItem.status} <> 'with_employee'`, desc(staffCustodyItem.issuedOn));
}

export type CustodyRow = Awaited<ReturnType<typeof listCustodyItems>>[number];

type LiveItem = Record<string, unknown> & { id: string; staffId: string };

/** A live (not removed) row of one profile group, with its owner. */
export async function findLiveItem(
	kind: ProfileItemKind,
	id: string
): Promise<LiveItem | undefined> {
	switch (kind) {
		case 'contact': {
			const [row] = await db
				.select(contactColumns)
				.from(staffEmergencyContact)
				.where(and(eq(staffEmergencyContact.id, id), isNull(staffEmergencyContact.removedAt)));
			return row;
		}
		case 'experience': {
			const [row] = await db
				.select(experienceColumns)
				.from(staffExperience)
				.where(and(eq(staffExperience.id, id), isNull(staffExperience.removedAt)));
			return row;
		}
		case 'skill': {
			const [row] = await db
				.select(staffSkillColumns)
				.from(staffSkill)
				.innerJoin(skill, eq(skill.id, staffSkill.skillId))
				.where(and(eq(staffSkill.id, id), isNull(staffSkill.removedAt)));
			return row;
		}
		case 'social': {
			const [row] = await db
				.select(socialColumns)
				.from(staffSocialAccount)
				.where(and(eq(staffSocialAccount.id, id), isNull(staffSocialAccount.removedAt)));
			return row;
		}
		case 'custody': {
			const [row] = await db
				.select(custodyColumns)
				.from(staffCustodyItem)
				.innerJoin(custodyItemType, eq(custodyItemType.id, staffCustodyItem.itemTypeId))
				.where(and(eq(staffCustodyItem.id, id), isNull(staffCustodyItem.removedAt)));
			return row;
		}
	}
}

/** The next free `position` among a person's live contacts. */
export async function nextContactPosition(staffId: string): Promise<number> {
	const [row] = await db
		.select({ max: sql<number | null>`max(${staffEmergencyContact.position})` })
		.from(staffEmergencyContact)
		.where(
			and(eq(staffEmergencyContact.staffId, staffId), isNull(staffEmergencyContact.removedAt))
		);
	return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1;
}

export async function findJobTitle(id: string) {
	const [row] = await db
		.select({ id: jobTitle.id, active: jobTitle.active })
		.from(jobTitle)
		.where(eq(jobTitle.id, id))
		.limit(1);
	return row;
}

export async function findCustodyItemType(id: string) {
	const [row] = await db
		.select({ id: custodyItemType.id, active: custodyItemType.active })
		.from(custodyItemType)
		.where(eq(custodyItemType.id, id))
		.limit(1);
	return row;
}

export async function findSkill(id: string) {
	const [row] = await db
		.select({ id: skill.id, active: skill.active })
		.from(skill)
		.where(eq(skill.id, id))
		.limit(1);
	return row;
}

export function updateStaffProfile(
	staffId: string,
	values: Partial<typeof staff.$inferInsert>
): BatchQuery {
	return db.update(staff).set(values).where(eq(staff.id, staffId));
}

export function insertContact(values: typeof staffEmergencyContact.$inferInsert): BatchQuery {
	return db.insert(staffEmergencyContact).values(values);
}

export function updateContact(
	id: string,
	values: Partial<typeof staffEmergencyContact.$inferInsert>
): BatchQuery {
	return db.update(staffEmergencyContact).set(values).where(eq(staffEmergencyContact.id, id));
}

export function insertExperience(values: typeof staffExperience.$inferInsert): BatchQuery {
	return db.insert(staffExperience).values(values);
}

export function updateExperience(
	id: string,
	values: Partial<typeof staffExperience.$inferInsert>
): BatchQuery {
	return db.update(staffExperience).set(values).where(eq(staffExperience.id, id));
}

export function insertStaffSkill(values: typeof staffSkill.$inferInsert): BatchQuery {
	return db.insert(staffSkill).values(values);
}

export function updateStaffSkill(
	id: string,
	values: Partial<typeof staffSkill.$inferInsert>
): BatchQuery {
	return db.update(staffSkill).set(values).where(eq(staffSkill.id, id));
}

export function insertSocialAccount(values: typeof staffSocialAccount.$inferInsert): BatchQuery {
	return db.insert(staffSocialAccount).values(values);
}

export function updateSocialAccount(
	id: string,
	values: Partial<typeof staffSocialAccount.$inferInsert>
): BatchQuery {
	return db.update(staffSocialAccount).set(values).where(eq(staffSocialAccount.id, id));
}

export function insertCustodyItem(values: typeof staffCustodyItem.$inferInsert): BatchQuery {
	return db.insert(staffCustodyItem).values(values);
}

export function updateCustodyItem(
	id: string,
	values: Partial<typeof staffCustodyItem.$inferInsert>
): BatchQuery {
	return db.update(staffCustodyItem).set(values).where(eq(staffCustodyItem.id, id));
}

/**
 * Insert or overwrite a person's row for one document type (unique per person and type). `id` is
 * used only when the row is new.
 */
export function upsertStaffDocument(
	key: { id: string; staffId: string; documentTypeId: string },
	changes: Pick<
		typeof staffDocument.$inferInsert,
		'received' | 'receivedOn' | 'referenceNo' | 'expiresOn' | 'note'
	>
): BatchQuery {
	return db
		.insert(staffDocument)
		.values({ ...key, ...changes })
		.onConflictDoUpdate({
			target: [staffDocument.staffId, staffDocument.documentTypeId],
			set: { ...changes, updatedAt: new Date() }
		});
}

/** Soft removal (H10): the row stays, with who removed it and when. */
export function removeItem(kind: ProfileItemKind, id: string, by: string | null): BatchQuery {
	const values = { removedAt: new Date(), removedBy: by };
	if (kind === 'contact') return updateContact(id, values);
	if (kind === 'experience') return updateExperience(id, values);
	if (kind === 'skill') return updateStaffSkill(id, values);
	if (kind === 'custody') return updateCustodyItem(id, values);
	return updateSocialAccount(id, values);
}
