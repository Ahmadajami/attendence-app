import { describe, expect, it } from 'vitest';
import type { JobHolder } from '#lib/types/jobs.js';
import type { StaffListOption } from '#lib/types/profile.js';
import { filterJobs, holdersByJob, jobStatus, jobStatusCounts, withHolderCounts } from './jobs.js';

// Made-up job titles and people only (CLAUDE.md §1).
const job = (id: string, nameEn: string, nameAr: string, active = true): StaffListOption => ({
	id,
	nameEn,
	nameAr,
	active,
	required: false
});

const jobs = [
	job('j1', 'Test Agent', 'وكيل تجريبي'),
	job('j2', 'Test Supervisor', 'مُشرِف تجريبي'),
	job('j3', 'Old Café Role', 'دور قديم', false)
];

const holder = (id: string, jobTitleId: string, active = true): JobHolder => ({
	id,
	jobTitleId,
	employeeNo: `T-${id}`,
	fullName: `Person ${id}`,
	fullNameAr: null,
	active,
	team: null
});

describe('jobStatus', () => {
	it('keeps a known status and falls back to active', () => {
		expect(jobStatus('inactive')).toBe('inactive');
		expect(jobStatus('all')).toBe('all');
		expect(jobStatus(null)).toBe('active');
		expect(jobStatus('bogus')).toBe('active');
	});
});

describe('filterJobs', () => {
	it('filters by status', () => {
		expect(filterJobs(jobs, { query: '', status: 'active' }).map((j) => j.id)).toEqual([
			'j1',
			'j2'
		]);
		expect(filterJobs(jobs, { query: '', status: 'inactive' }).map((j) => j.id)).toEqual(['j3']);
		expect(filterJobs(jobs, { query: '', status: 'all' })).toHaveLength(3);
	});

	it('matches the English name, ignoring case and accents', () => {
		expect(filterJobs(jobs, { query: 'SUPER', status: 'all' }).map((j) => j.id)).toEqual(['j2']);
		expect(filterJobs(jobs, { query: 'cafe', status: 'all' }).map((j) => j.id)).toEqual(['j3']);
	});

	it('matches the Arabic name, ignoring diacritics', () => {
		expect(filterJobs(jobs, { query: 'مشرف', status: 'all' }).map((j) => j.id)).toEqual(['j2']);
		expect(filterJobs(jobs, { query: ' وكيل ', status: 'active' }).map((j) => j.id)).toEqual([
			'j1'
		]);
	});

	it('returns nothing when no name matches', () => {
		expect(filterJobs(jobs, { query: 'pilot', status: 'all' })).toEqual([]);
	});
});

describe('jobStatusCounts', () => {
	it('counts each filter', () => {
		expect(jobStatusCounts(jobs)).toEqual({ active: 2, inactive: 1, all: 3 });
	});
});

describe('holder counts', () => {
	const holders = [
		holder('1', 'j1'),
		holder('2', 'j1', false),
		holder('3', 'j1'),
		holder('4', 'j3')
	];

	it('groups holders by job', () => {
		const byJob = holdersByJob(holders);
		expect(byJob.get('j1')?.map((h) => h.id)).toEqual(['1', '2', '3']);
		expect(byJob.has('j2')).toBe(false);
	});

	it('counts active and inactive holders, zero for an unheld job', () => {
		const rows = withHolderCounts(jobs, holders);
		expect(rows.map((r) => [r.id, r.activeCount, r.inactiveCount])).toEqual([
			['j1', 2, 1],
			['j2', 0, 0],
			['j3', 1, 0]
		]);
	});
});
