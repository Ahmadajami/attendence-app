import { and, asc, count, eq, isNotNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import {
	custodyItemType,
	documentType,
	jobTitle,
	skill,
	staff,
	team
} from '#lib/server/db/schema/index.js';
import type { StaffListKind } from '#lib/schemas/staff-lists.schema.js';
import type { JobHolder } from '#lib/types/jobs.js';
import type { StaffListOption } from '#lib/types/profile.js';
import type { BatchQuery } from '../common.js';

/** One item of a list; `required` is `false` for job titles and skills. */
export type StaffListItem = StaffListOption;

export async function listJobTitles(): Promise<StaffListItem[]> {
	const rows = await db
		.select({
			id: jobTitle.id,
			nameEn: jobTitle.nameEn,
			nameAr: jobTitle.nameAr,
			active: jobTitle.active
		})
		.from(jobTitle)
		.orderBy(asc(jobTitle.nameEn));
	return rows.map((row) => ({ ...row, required: false }));
}

/** Everyone who holds a job title, active or not, with their current team (jobs plan JB7). */
export async function listJobTitleHolders(): Promise<JobHolder[]> {
	const rows = await db
		.select({
			id: staff.id,
			jobTitleId: staff.jobTitleId,
			employeeNo: staff.employeeNo,
			fullName: staff.fullName,
			fullNameAr: staff.fullNameAr,
			active: staff.active,
			teamNameEn: team.nameEn,
			teamNameAr: team.nameAr
		})
		.from(staff)
		.leftJoin(team, eq(staff.teamId, team.id))
		.where(isNotNull(staff.jobTitleId))
		.orderBy(asc(staff.fullName));
	return rows.flatMap(({ jobTitleId, teamNameEn, teamNameAr, ...row }) =>
		jobTitleId
			? [
					{
						...row,
						jobTitleId,
						team:
							teamNameEn !== null && teamNameAr !== null
								? { nameEn: teamNameEn, nameAr: teamNameAr }
								: null
					}
				]
			: []
	);
}

/** How many active people hold one job title (JB5). */
export async function countActiveJobTitleHolders(jobTitleId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(staff)
		.where(and(eq(staff.jobTitleId, jobTitleId), eq(staff.active, true)));
	return row?.n ?? 0;
}

export async function listSkills(): Promise<StaffListItem[]> {
	const rows = await db
		.select({ id: skill.id, nameEn: skill.nameEn, nameAr: skill.nameAr, active: skill.active })
		.from(skill)
		.orderBy(asc(skill.nameEn));
	return rows.map((row) => ({ ...row, required: false }));
}

export async function listDocumentTypes(): Promise<StaffListItem[]> {
	return db
		.select({
			id: documentType.id,
			nameEn: documentType.nameEn,
			nameAr: documentType.nameAr,
			required: documentType.required,
			active: documentType.active
		})
		.from(documentType)
		.orderBy(asc(documentType.nameEn));
}

export async function listCustodyItemTypes(): Promise<StaffListItem[]> {
	const rows = await db
		.select({
			id: custodyItemType.id,
			nameEn: custodyItemType.nameEn,
			nameAr: custodyItemType.nameAr,
			active: custodyItemType.active
		})
		.from(custodyItemType)
		.orderBy(asc(custodyItemType.nameEn));
	return rows.map((row) => ({ ...row, required: false }));
}

export async function listItems(kind: StaffListKind): Promise<StaffListItem[]> {
	if (kind === 'job_title') return listJobTitles();
	if (kind === 'skill') return listSkills();
	if (kind === 'custody_item_type') return listCustodyItemTypes();
	return listDocumentTypes();
}

export async function findItem(
	kind: StaffListKind,
	id: string
): Promise<StaffListItem | undefined> {
	const rows = await listItems(kind);
	return rows.find((row) => row.id === id);
}

type ItemValues = {
	id?: string;
	nameEn?: string;
	nameAr?: string;
	required?: boolean;
	active?: boolean;
};

export function insertItem(
	kind: StaffListKind,
	{ required, ...values }: ItemValues & { id: string; nameEn: string; nameAr: string }
): BatchQuery {
	if (kind === 'job_title') return db.insert(jobTitle).values(values);
	if (kind === 'skill') return db.insert(skill).values(values);
	if (kind === 'custody_item_type') return db.insert(custodyItemType).values(values);
	return db.insert(documentType).values({ ...values, required: required ?? false });
}

export function updateItem(
	kind: StaffListKind,
	id: string,
	{ required, ...values }: ItemValues
): BatchQuery {
	if (kind === 'job_title') return db.update(jobTitle).set(values).where(eq(jobTitle.id, id));
	if (kind === 'skill') return db.update(skill).set(values).where(eq(skill.id, id));
	if (kind === 'custody_item_type')
		return db.update(custodyItemType).set(values).where(eq(custodyItemType.id, id));
	return db
		.update(documentType)
		.set({ ...values, ...(required === undefined ? {} : { required }) })
		.where(eq(documentType.id, id));
}
