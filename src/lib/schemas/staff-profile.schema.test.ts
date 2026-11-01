import { describe, expect, it } from 'vitest';
import { profileIdentityFormSchema } from './staff-profile.schema.js';

// Made-up values only (CLAUDE.md §1).
const valid = {
	fatherNameEn: 'Test Father',
	fatherNameAr: 'أب تجريبي',
	motherNameEn: '',
	motherNameAr: '',
	nationalIdNo: '01234567890',
	nationalIdIssuedOn: '2020-05-01',
	nationalIdExpiresOn: '2030-05-01',
	passportNo: 'N-1234567'
};

const parse = (patch: Record<string, unknown>) =>
	profileIdentityFormSchema.safeParse({ ...valid, ...patch });

describe('profileIdentityFormSchema (H13)', () => {
	it('accepts a full record and an empty one', () => {
		expect(parse({}).success).toBe(true);
		expect(profileIdentityFormSchema.safeParse({}).success).toBe(true);
	});

	it('turns Arabic-Indic digits into ASCII and trims', () => {
		const result = parse({ nationalIdNo: ' ٠١٢٣٤ ' });
		expect(result.success && result.data.nationalIdNo).toBe('01234');
	});

	it('refuses spaces and symbols in ID and passport numbers', () => {
		const result = parse({ nationalIdNo: '12 34', passportNo: 'N#1' });
		expect(result.success).toBe(false);
		if (!result.success)
			expect(result.error.issues.map((i) => i.path.join('.')).sort()).toEqual([
				'nationalIdNo',
				'passportNo'
			]);
	});

	it('refuses a date that is not yyyy-mm-dd', () => {
		expect(parse({ nationalIdIssuedOn: '01/05/2020' }).success).toBe(false);
	});
});
