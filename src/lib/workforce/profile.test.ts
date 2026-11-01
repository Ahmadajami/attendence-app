import { describe, expect, it } from 'vitest';
import {
	cleanNamePart,
	custodySummary,
	displayName,
	documentSummary,
	experienceMonths,
	formatExperience,
	initials,
	resolveNames
} from './profile.js';

// Made-up people and papers only.

describe('displayName', () => {
	it('joins first and last', () => {
		expect(displayName('Sam', 'Example')).toBe('Sam Example');
		expect(displayName('سامي', 'مثال')).toBe('سامي مثال');
	});

	it('trims and collapses extra spaces', () => {
		expect(displayName('  Ana  Maria ', ' Test   Person ')).toBe('Ana Maria Test Person');
		expect(cleanNamePart('   ')).toBeNull();
	});

	it('is null when either part is missing', () => {
		expect(displayName('Sam', '')).toBeNull();
		expect(displayName(null, 'Example')).toBeNull();
		expect(displayName('  ', '  ')).toBeNull();
	});
});

describe('initials', () => {
	it('takes the first letter of the first two words', () => {
		expect(initials('Sam Example')).toBe('SE');
		expect(initials('  ana  maria test ')).toBe('AM');
		expect(initials('Sam')).toBe('S');
	});

	it('keeps two Arabic letters apart', () => {
		expect(initials('سامي مثال')).toBe('س\u200cم');
		expect(initials('سامي')).toBe('س');
	});

	it('is empty for no name', () => {
		expect(initials('')).toBe('');
		expect(initials('   ')).toBe('');
		expect(initials(null)).toBe('');
	});
});

describe('resolveNames', () => {
	const none = { firstNameEn: null, lastNameEn: null, firstNameAr: null, lastNameAr: null };
	const fallback = { fullName: 'Old Made Up Name', fullNameAr: 'اسم قديم' };

	it('builds both full names from the parts', () => {
		const result = resolveNames(
			{ firstNameEn: ' Sam ', lastNameEn: 'Example', firstNameAr: 'سامي', lastNameAr: 'مثال' },
			fallback
		);
		expect(result).toEqual({
			ok: true,
			parts: { firstNameEn: 'Sam', lastNameEn: 'Example', firstNameAr: 'سامي', lastNameAr: 'مثال' },
			fullName: 'Sam Example',
			fullNameAr: 'سامي مثال'
		});
	});

	it('keeps the fallback for a language without parts', () => {
		const result = resolveNames({ ...none, firstNameEn: 'Sam', lastNameEn: 'Example' }, fallback);
		expect(result).toMatchObject({ ok: true, fullName: 'Sam Example', fullNameAr: 'اسم قديم' });
		expect(resolveNames(none, fallback)).toMatchObject({
			fullName: 'Old Made Up Name',
			fullNameAr: 'اسم قديم'
		});
	});

	it('points at the missing half', () => {
		expect(resolveNames({ ...none, firstNameEn: 'Sam' }, fallback)).toEqual({
			ok: false,
			field: 'lastNameEn'
		});
		expect(resolveNames({ ...none, lastNameAr: 'مثال' }, fallback)).toEqual({
			ok: false,
			field: 'firstNameAr'
		});
	});

	it('gives no English name without parts or fallback', () => {
		expect(resolveNames(none, { fullName: '  ', fullNameAr: null })).toMatchObject({
			ok: true,
			fullName: null,
			fullNameAr: null
		});
	});
});

describe('experienceMonths', () => {
	const today = '2026-11-01';

	it('is zero with no jobs and no start date', () => {
		expect(experienceMonths([], null, today)).toBe(0);
	});

	it('counts one closed job', () => {
		// 2020-01-01 … 2021-12-31 = 731 days = 24 months.
		expect(
			experienceMonths([{ startedOn: '2020-01-01', endedOn: '2021-12-31' }], null, today)
		).toBe(24);
	});

	it('counts overlapping jobs once', () => {
		const jobs = [
			{ startedOn: '2018-01-01', endedOn: '2019-12-31' },
			{ startedOn: '2019-01-01', endedOn: '2020-12-31' }
		];
		expect(experienceMonths(jobs, null, today)).toBe(36);
	});

	it('merges touching jobs', () => {
		const jobs = [
			{ startedOn: '2018-01-01', endedOn: '2018-12-31' },
			{ startedOn: '2019-01-01', endedOn: '2019-12-31' }
		];
		expect(experienceMonths(jobs, null, today)).toBe(24);
	});

	it('adds the time here and counts a job ending after the start date once', () => {
		const jobs = [{ startedOn: '2023-11-01', endedOn: '2025-05-01' }];
		// Here since 2024-11-01; together 2023-11-01 … 2026-11-01 = 3 years.
		expect(experienceMonths(jobs, '2024-11-01', today)).toBe(36);
	});

	it('counts an ongoing job until today and ignores time after today', () => {
		expect(experienceMonths([{ startedOn: '2025-11-01', endedOn: null }], null, today)).toBe(12);
		expect(
			experienceMonths([{ startedOn: '2025-11-01', endedOn: '2030-01-01' }], null, today)
		).toBe(12);
		expect(experienceMonths([], '2027-01-01', today)).toBe(0);
	});

	it('handles jobs in any order', () => {
		const jobs = [
			{ startedOn: '2021-01-01', endedOn: '2021-12-31' },
			{ startedOn: '2015-01-01', endedOn: '2015-12-31' }
		];
		expect(experienceMonths(jobs, null, today)).toBe(24);
	});
});

describe('formatExperience', () => {
	it('splits months into years and months', () => {
		expect(formatExperience(0)).toEqual({ years: 0, months: 0 });
		expect(formatExperience(11)).toEqual({ years: 0, months: 11 });
		expect(formatExperience(38)).toEqual({ years: 3, months: 2 });
	});
});

describe('custodySummary', () => {
	it('counts items per status', () => {
		const items = [
			{ status: 'with_employee' },
			{ status: 'lost' },
			{ status: 'with_employee' },
			{ status: 'returned' }
		];
		expect(custodySummary(items)).toEqual({ with_employee: 2, lost: 1, returned: 1 });
		expect(custodySummary([])).toEqual({});
	});
});

describe('documentSummary', () => {
	const types = [
		{ id: 'id-card', required: true, active: true },
		{ id: 'certificate', required: true, active: true },
		{ id: 'old-form', required: true, active: false },
		{ id: 'photo', required: false, active: true },
		{ id: 'medical', required: true, active: true }
	];

	it('counts required, active types only', () => {
		const docs = [
			{ documentTypeId: 'id-card', received: true },
			{ documentTypeId: 'certificate', received: false },
			{ documentTypeId: 'old-form', received: true },
			{ documentTypeId: 'photo', received: true }
		];
		expect(documentSummary(types, docs)).toEqual({
			required: 3,
			received: 1,
			missing: ['certificate', 'medical']
		});
	});

	it('is zero of zero with no required types', () => {
		expect(documentSummary([], [])).toEqual({ required: 0, received: 0, missing: [] });
	});
});
