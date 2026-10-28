import { describe, expect, it } from 'vitest';
import { descendantIds, flattenTree, wouldCreateCycle } from './departments.js';
import { nextEmployeeNo } from './employee-no.js';

// Made-up departments only.
const rows = [
	{ id: 'ops', parentId: null, name: 'Operations' },
	{ id: 'ramp', parentId: 'ops', name: 'Ramp' },
	{ id: 'bag', parentId: 'ops', name: 'Baggage' },
	{ id: 'ramp-a', parentId: 'ramp', name: 'Ramp A' },
	{ id: 'sec', parentId: null, name: 'Security' },
	{ id: 'orphan', parentId: 'gone', name: 'Orphan' }
];
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

describe('flattenTree', () => {
	it('puts parents before children, siblings sorted, with depth', () => {
		const flat = flattenTree(rows, byName).map((r) => `${r.depth}:${r.id}`);
		expect(flat).toEqual(['0:ops', '1:bag', '1:ramp', '2:ramp-a', '0:orphan', '0:sec']);
	});

	it('never loops or drops rows on a cycle in bad data', () => {
		const cyclic = [
			{ id: 'a', parentId: 'b', name: 'A' },
			{ id: 'b', parentId: 'a', name: 'B' }
		];
		expect(flattenTree(cyclic, byName)).toHaveLength(0);
	});
});

describe('descendantIds / wouldCreateCycle', () => {
	it('finds every level below', () => {
		expect([...descendantIds(rows, 'ops')].sort()).toEqual(['bag', 'ramp', 'ramp-a']);
		expect(descendantIds(rows, 'sec').size).toBe(0);
	});

	it('refuses moving a department under itself or its descendants', () => {
		expect(wouldCreateCycle(rows, 'ops', 'ops')).toBe(true);
		expect(wouldCreateCycle(rows, 'ops', 'ramp-a')).toBe(true);
		expect(wouldCreateCycle(rows, 'ramp', 'sec')).toBe(false);
		expect(wouldCreateCycle(rows, 'ramp', null)).toBe(false);
	});
});

describe('nextEmployeeNo', () => {
	it('is one more than the highest number, including deactivated ones', () => {
		expect(nextEmployeeNo(['1003', '1250', '1001'])).toBe('1251');
	});

	it('starts at the configured start when nothing is higher', () => {
		expect(nextEmployeeNo([])).toBe('1000');
		expect(nextEmployeeNo(['12', '7'], 1000)).toBe('1000');
		expect(nextEmployeeNo([], 5000)).toBe('5000');
	});

	it('ignores non-digit values and handles long numbers', () => {
		expect(nextEmployeeNo(['2011-110', 'abc', '1500'])).toBe('1501');
		expect(nextEmployeeNo(['900719925474099312'])).toBe('900719925474099313');
	});
});
