import { describe, expect, it } from 'vitest';
import { STAFF_CREATE_REQUIRED, staffCreateFormSchema } from './staff.schema.js';

// A made-up person (CLAUDE.md §1).
const valid = {
	firstNameEn: 'Sam',
	lastNameEn: 'Example',
	firstNameAr: 'سامي',
	lastNameAr: 'مثال',
	nationalIdNo: '00000000001',
	startDate: '2026-01-01'
};

const failing = (patch: Record<string, unknown>) => {
	const result = staffCreateFormSchema.safeParse({ ...valid, ...patch });
	return result.success ? [] : result.error.issues.map((i) => i.path.join('.')).sort();
};

describe('staffCreateFormSchema (create plan C2)', () => {
	it('accepts the required fields alone; everything else is optional', () => {
		expect(failing({})).toEqual([]);
	});

	it('refuses each required field when empty or blank', () => {
		for (const name of STAFF_CREATE_REQUIRED) expect(failing({ [name]: '  ' })).toEqual([name]);
	});

	it('refuses a malformed personal email and ID number', () => {
		expect(failing({ personalEmail: 'not-an-email', nationalIdNo: '12 34' })).toEqual([
			'nationalIdNo',
			'personalEmail'
		]);
	});
});
