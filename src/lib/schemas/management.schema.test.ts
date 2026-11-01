import { describe, expect, it } from 'vitest';
import { departmentManagerFormSchema } from './management.schema.js';

// Made-up ids (CLAUDE.md §1).
const valid = {
	departmentId: '00000000-0000-4000-8000-000000000001',
	staffId: '00000000-0000-4000-8000-000000000002',
	validFrom: '2026-12-01',
	reason: 'New manager'
};

describe('departmentManagerFormSchema', () => {
	it('accepts a manager, or nobody ("")', () => {
		expect(departmentManagerFormSchema.safeParse(valid).success).toBe(true);
		expect(departmentManagerFormSchema.safeParse({ ...valid, staffId: '' }).success).toBe(true);
	});

	it('needs a real date and a reason', () => {
		expect(
			departmentManagerFormSchema.safeParse({ ...valid, validFrom: '2026-02-30' }).success
		).toBe(false);
		expect(departmentManagerFormSchema.safeParse({ ...valid, reason: '   ' }).success).toBe(false);
	});

	it('needs a department', () => {
		expect(departmentManagerFormSchema.safeParse({ ...valid, departmentId: '' }).success).toBe(
			false
		);
	});
});
