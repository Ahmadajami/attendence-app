import { describe, expect, it } from 'vitest';
import { containsPattern, MAX_PERSON_SEARCH, personSearch } from './person-search.js';

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
