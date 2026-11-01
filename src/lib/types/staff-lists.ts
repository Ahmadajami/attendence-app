import type { StaffListOption } from './profile.js';

/** The four lists, active and inactive (what `listStaffLists` returns). */
export type StaffLists = {
	jobTitles: StaffListOption[];
	skills: StaffListOption[];
	documentTypes: StaffListOption[];
	custodyItemTypes: StaffListOption[];
};
