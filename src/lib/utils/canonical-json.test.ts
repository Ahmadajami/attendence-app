import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical-json.js';

describe('canonicalJson', () => {
	it('gives the same text for the same data in any key order, nested too', () => {
		const built = { field: 'row', code: 'unknown_shift', more: { b: 1, a: [{ y: 2, x: 1 }] } };
		const stored = { code: 'unknown_shift', more: { a: [{ x: 1, y: 2 }], b: 1 }, field: 'row' };
		expect(canonicalJson(built)).toBe(canonicalJson(stored));
	});

	it('keeps array order and tells different data apart', () => {
		expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
		expect(canonicalJson({ a: null })).not.toBe(canonicalJson({ a: 0 }));
	});
});
