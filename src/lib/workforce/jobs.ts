import type { JobHolder, JobRow } from '#lib/types/jobs.js';
import type { StaffListOption } from '#lib/types/profile.js';

/** The status filter of `/jobs`, kept in `?status=` (jobs plan JB6). */
export const JOB_STATUSES = ['active', 'inactive', 'all'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** `?status=` → a known status; anything else is `active`. */
export function jobStatus(value: string | null): JobStatus {
	return value && (JOB_STATUSES as readonly string[]).includes(value)
		? (value as JobStatus)
		: 'active';
}

/** Lower case without accents or Arabic diacritics, so a search ignores both. */
function fold(text: string): string {
	return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

/** Jobs whose English or Arabic name contains `query`, with the given status. */
export function filterJobs<T extends StaffListOption>(
	rows: T[],
	{ query, status }: { query: string; status: JobStatus }
): T[] {
	const q = fold(query.trim());
	return rows.filter(
		(row) =>
			(status === 'all' || row.active === (status === 'active')) &&
			(!q || fold(row.nameEn).includes(q) || fold(row.nameAr).includes(q))
	);
}

/** How many jobs each status filter shows. */
export function jobStatusCounts(rows: StaffListOption[]): Record<JobStatus, number> {
	const active = rows.filter((row) => row.active).length;
	return { active, inactive: rows.length - active, all: rows.length };
}

/** The holders of each job title, by job title id. */
export function holdersByJob(holders: JobHolder[]): Map<string, JobHolder[]> {
	const byJob = new Map<string, JobHolder[]>();
	for (const holder of holders) {
		const list = byJob.get(holder.jobTitleId);
		if (list) list.push(holder);
		else byJob.set(holder.jobTitleId, [holder]);
	}
	return byJob;
}

/** Each job title with its active and inactive holder counts. */
export function withHolderCounts(jobs: StaffListOption[], holders: JobHolder[]): JobRow[] {
	const byJob = holdersByJob(holders);
	return jobs.map((job) => {
		const list = byJob.get(job.id) ?? [];
		const activeCount = list.filter((holder) => holder.active).length;
		return { ...job, activeCount, inactiveCount: list.length - activeCount };
	});
}
