import { describe, expect, it } from 'vitest';
import { normalizeSlots, withSlots } from './slots.js';

const A = '6485aa89-4b84-418d-88b2-24629a318e6c';

describe('normalizeSlots', () => {
	it('turns the driver\'s "NULL" strings into off days', () => {
		expect(normalizeSlots([A, 'NULL', null, 'null'])).toEqual([A, null, null, null]);
	});

	it('keeps the rest of a row', () => {
		expect(withSlots({ id: 'x', slots: ['NULL', A] })).toEqual({ id: 'x', slots: [null, A] });
	});
});
