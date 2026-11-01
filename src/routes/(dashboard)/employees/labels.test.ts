import { describe, expect, it } from 'vitest';
import { employeeStatus, filterByStatus, statusCounts } from './labels.js';

// Made-up records (CLAUDE.md §1): ids and the active flag only.
const people = [
	{ id: 'a', active: true },
	{ id: 'b', active: false },
	{ id: 'c', active: true }
];

describe('employeeStatus', () => {
	it('defaults to active (Q-T6)', () => {
		expect(employeeStatus(null)).toBe('active');
		expect(employeeStatus('')).toBe('active');
	});

	it('keeps a known value and falls back on an unknown one', () => {
		expect(employeeStatus('inactive')).toBe('inactive');
		expect(employeeStatus('all')).toBe('all');
		expect(employeeStatus('archived')).toBe('active');
	});
});

describe('filterByStatus', () => {
	it('shows active, inactive or everyone', () => {
		expect(filterByStatus(people, 'active').map((p) => p.id)).toEqual(['a', 'c']);
		expect(filterByStatus(people, 'inactive').map((p) => p.id)).toEqual(['b']);
		expect(filterByStatus(people, 'all').map((p) => p.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('statusCounts', () => {
	it('counts the whole list', () => {
		expect(statusCounts(people)).toEqual({ active: 2, inactive: 1, all: 3 });
		expect(statusCounts([])).toEqual({ active: 0, inactive: 0, all: 0 });
	});
});
