import { describe, expect, it } from 'vitest';
import { containsPattern, filterPeople, MAX_PERSON_SEARCH, personSearch } from './person-search.js';

describe('personSearch', () => {
	it('trims the search', () => {
		expect(personSearch('  Test Person ')).toBe('Test Person');
	});

	it('is null when empty, blank or missing', () => {
		expect(personSearch('')).toBeNull();
		expect(personSearch('   ')).toBeNull();
		expect(personSearch(null)).toBeNull();
		expect(personSearch(undefined)).toBeNull();
	});

	it('cuts a long search', () => {
		expect(personSearch('x'.repeat(200))).toHaveLength(MAX_PERSON_SEARCH);
	});
});

describe('containsPattern', () => {
	it('wraps the search in %', () => {
		expect(containsPattern('E-0001')).toBe('%E-0001%');
	});

	it('escapes LIKE wildcards and the escape character', () => {
		expect(containsPattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
	});
});

describe('filterPeople', () => {
	const people = [
		{ employeeNo: 'E-0001', fullName: 'Test Person', fullNameAr: 'شخص تجريبي' },
		{ employeeNo: 'E-0002', fullName: 'Sample Worker', fullNameAr: null },
		{ employeeNo: 'X-0103', fullName: 'Other Name', fullNameAr: 'اسم آخر' }
	];

	it('keeps everyone, in order, when the search is blank', () => {
		expect(filterPeople(people, '   ')).toEqual(people);
	});

	it('matches the employee number', () => {
		expect(filterPeople(people, '0002').map((p) => p.employeeNo)).toEqual(['E-0002']);
	});

	it('matches the English name, ignoring case and outer spaces', () => {
		expect(filterPeople(people, '  sample ').map((p) => p.employeeNo)).toEqual(['E-0002']);
	});

	it('matches the Arabic name', () => {
		expect(filterPeople(people, 'تجريبي').map((p) => p.employeeNo)).toEqual(['E-0001']);
	});

	it('is empty when nobody matches', () => {
		expect(filterPeople(people, 'nobody')).toEqual([]);
	});
});
