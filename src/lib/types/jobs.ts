import type { StaffListOption } from './profile.js';

/** One person who holds a job title (jobs plan JB7). */
export type JobHolder = {
	id: string;
	jobTitleId: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	active: boolean;
	/** The current team, if any. */
	team: { nameEn: string; nameAr: string } | null;
};

/** One row of the jobs table: the job title with how many people hold it (JB6). */
export type JobRow = StaffListOption & { activeCount: number; inactiveCount: number };
