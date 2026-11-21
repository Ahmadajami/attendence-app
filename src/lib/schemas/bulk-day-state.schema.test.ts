import { describe, expect, it } from 'vitest';
import { bulkDayStateSchema } from './bulk-day-state.schema.js';

const target = { staffId: 'fa3e41db-d86e-4438-abd9-c0dd3ccb24ab', shiftDate: '2026-02-06' };
const input = { targets: [target], operation: 'sick', reason: ' Synthetic correction ' };

describe('bulkDayStateSchema', () => {
	it('requires an explicit state or clear operation', () => {
		expect(bulkDayStateSchema.safeParse({ ...input, operation: undefined }).success).toBe(false);
		expect(bulkDayStateSchema.parse({ ...input, operation: 'clear' })).toMatchObject({
			targets: [target],
			operation: 'clear',
			reason: 'Synthetic correction'
		});
	});

	it('rejects an empty selection and duplicate employee-days', () => {
		expect(bulkDayStateSchema.safeParse({ ...input, targets: [] }).success).toBe(false);
		const duplicate = { ...target, staffId: target.staffId.toUpperCase() };
		expect(bulkDayStateSchema.safeParse({ ...input, targets: [target, duplicate] }).success).toBe(
			false
		);
	});
});
