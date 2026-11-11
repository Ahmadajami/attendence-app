import { describe, expect, it } from 'vitest';
import { swapCancelSchema, swapDecisionSchema, swapFormSchema } from './swap.schema.js';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const ID = '00000000-0000-4000-8000-000000000003';

const selfSwap = {
	kind: 'self_swap',
	staffId: A,
	firstDate: '2026-11-03',
	secondDate: '2026-11-07',
	scope: 'week',
	reason: 'Family event'
};
const empSwap = { ...selfSwap, kind: 'emp_swap', otherStaffId: B, secondDate: '' };

const pathsOf = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
	result.error?.issues.map((i) => i.path[0]) ?? [];

describe('swapFormSchema (SW2, mirrors the swap_request checks)', () => {
	it('needs the new shift on a shift change (SC1)', () => {
		const change = { ...selfSwap, kind: 'shift_change', secondDate: '' };
		expect(pathsOf(swapFormSchema.safeParse(change))).toEqual(['shiftId']);
		expect(swapFormSchema.safeParse({ ...change, shiftId: ID }).success).toBe(true);
	});

	it('accepts a self swap and an employee swap without a return date', () => {
		expect(swapFormSchema.safeParse(selfSwap).success).toBe(true);
		const parsed = swapFormSchema.parse(empSwap);
		expect(parsed.secondDate).toBe('');
		expect(parsed.approve).toBe(false);
	});

	it('a self swap needs the off day', () => {
		expect(pathsOf(swapFormSchema.safeParse({ ...selfSwap, secondDate: '' }))).toContain(
			'secondDate'
		);
	});

	it('the two dates differ', () => {
		expect(
			pathsOf(swapFormSchema.safeParse({ ...selfSwap, secondDate: selfSwap.firstDate }))
		).toContain('secondDate');
	});

	it('an employee swap needs B, other than A', () => {
		expect(pathsOf(swapFormSchema.safeParse({ ...empSwap, otherStaffId: '' }))).toContain(
			'otherStaffId'
		);
		expect(pathsOf(swapFormSchema.safeParse({ ...empSwap, otherStaffId: A }))).toContain(
			'otherStaffId'
		);
	});

	it('requires a reason', () => {
		expect(pathsOf(swapFormSchema.safeParse({ ...selfSwap, reason: '  ' }))).toContain('reason');
	});
});

describe('swapDecisionSchema and swapCancelSchema (SW5)', () => {
	it('approving needs no note; rejecting does', () => {
		expect(swapDecisionSchema.safeParse({ id: ID, decision: 'approve' }).success).toBe(true);
		expect(pathsOf(swapDecisionSchema.safeParse({ id: ID, decision: 'reject' }))).toContain('note');
		expect(
			swapDecisionSchema.safeParse({ id: ID, decision: 'reject', note: 'Short staffed' }).success
		).toBe(true);
	});

	it('cancelling needs a reason', () => {
		expect(pathsOf(swapCancelSchema.safeParse({ id: ID, reason: '' }))).toContain('reason');
		expect(swapCancelSchema.safeParse({ id: ID, reason: 'Plans changed' }).success).toBe(true);
	});
});
