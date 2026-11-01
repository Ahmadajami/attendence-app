/** Client-safe shapes returned by the staff-profile service (plan 2026-11-01-employee-profile). */

import type { StaffLists } from './staff-lists.js';

/** An item of one of the staff lists (job titles, skills, …); `required` is `false` except for document types. */
export type StaffListOption = {
	id: string;
	nameEn: string;
	nameAr: string;
	required: boolean;
	active: boolean;
};

export type ProfilePerson = {
	id: string;
	fullName: string;
	fullNameAr: string | null;
	firstNameEn: string | null;
	lastNameEn: string | null;
	firstNameAr: string | null;
	lastNameAr: string | null;
	jobTitleId: string | null;
	personalEmail: string | null;
	startDate: string | null;
	employeeNo: string;
	phone: string | null;
	workEmail: string | null;
	active: boolean;
	functionId: string | null;
	departmentId: string | null;
	departmentNameEn: string | null;
	departmentNameAr: string | null;
	teamId: string | null;
	teamNameEn: string | null;
	teamNameAr: string | null;
};

export type ProfileContact = {
	id: string;
	staffId: string;
	name: string;
	relationship: string;
	phone: string;
	phone2: string | null;
	position: number;
};

export type ProfileExperience = {
	id: string;
	staffId: string;
	employer: string;
	jobTitle: string;
	startedOn: string;
	endedOn: string | null;
	note: string | null;
};

export type ProfileSkill = {
	id: string;
	staffId: string;
	skillId: string;
	level: number | null;
	nameEn: string;
	nameAr: string;
};

export type ProfileSocial = {
	id: string;
	staffId: string;
	platform: string;
	handle: string;
};

export type ProfileDocumentRecord = {
	id: string;
	documentTypeId: string;
	received: boolean;
	receivedOn: string | null;
	referenceNo: string | null;
	expiresOn: string | null;
	note: string | null;
};

export type ProfileCustodyItem = {
	id: string;
	staffId: string;
	itemTypeId: string;
	identifier: string | null;
	issuedOn: string;
	/** One of `CUSTODY_STATUSES`. */
	status: string;
	statusOn: string | null;
	note: string | null;
	nameEn: string;
	nameAr: string;
};

/** A document type a person can be asked for, and what they handed in. */
export type ProfileDocument = { type: StaffListOption; record: ProfileDocumentRecord | null };

export type StaffProfile = {
	person: ProfilePerson;
	jobTitle: StaffListOption | null;
	contacts: ProfileContact[];
	experience: ProfileExperience[];
	skills: ProfileSkill[];
	socials: ProfileSocial[];
	documents: ProfileDocument[];
	custody: ProfileCustodyItem[];
	/** The four lists, active and inactive (redesign plan V5). */
	lists: StaffLists;
	summary: {
		experienceMonths: number;
		documents: { required: number; received: number; missing: string[] };
		/** Items per status, e.g. `{ with_employee: 3, lost: 1 }`. */
		custody: Partial<Record<string, number>>;
	};
};
