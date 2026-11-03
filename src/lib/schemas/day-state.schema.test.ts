import { describe, expect, it } from 'vitest';
import { dayStateClearSchema, dayStateFormSchema } from './day-state.schema.js';
import { recomputeFromSchema } from './day-results.schema.js';

// Made-up ids (CLAUDE.md §1).
const state = {
	staffId: '00000000-0000-4000-8000-000000000002',
	state: 'leave' as const,
	startsOn: '2026-12-01',
	endsOn: '2026-12-05',
	reason: 'Planned leave'
};

describe('dayStateFormSchema', () => {
	it('accepts a state over a range', () => {
		expect(dayStateFormSchema.safeParse(state).success).toBe(true);
	});

	it('needs a state, a reason, and the end on or after the start', () => {
		expect(dayStateFormSchema.safeParse({ ...state, state: '' }).success).toBe(false);
		expect(dayStateFormSchema.safeParse({ ...state, reason: '' }).success).toBe(false);
		expect(dayStateFormSchema.safeParse({ ...state, endsOn: '2026-11-30' }).success).toBe(false);
	});

	it('covers at most a year (366 days)', () => {
		expect(dayStateFormSchema.safeParse({ ...state, endsOn: '2027-12-01' }).success).toBe(true);
		expect(dayStateFormSchema.safeParse({ ...state, endsOn: '2027-12-02' }).success).toBe(false);
	});
});

describe('dayStateClearSchema', () => {
	it('needs the range in order and a reason', () => {
		const clear = {
			staffId: state.staffId,
			startsOn: state.startsOn,
			endsOn: state.endsOn,
			reason: state.reason
		};
		expect(dayStateClearSchema.safeParse(clear).success).toBe(true);
		expect(dayStateClearSchema.safeParse({ ...clear, endsOn: '2026-11-01' }).success).toBe(false);
	});
});

describe('recomputeFromSchema', () => {
	it('needs a real date', () => {
		expect(recomputeFromSchema.safeParse({ from: '2026-10-01' }).success).toBe(true);
		expect(recomputeFromSchema.safeParse({ from: '' }).success).toBe(false);
	});
});
