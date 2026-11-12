import { describe, expect, it } from 'vitest';
import { pageWindow, parsePage } from './pagination.js';

describe('parsePage', () => {
	it('reads a whole number from 1', () => {
		expect(parsePage('1')).toBe(1);
		expect(parsePage('12')).toBe(12);
	});

	it('ignores spaces around the number', () => {
		expect(parsePage(' 3')).toBe(3);
		expect(parsePage('4 ')).toBe(4);
	});

	it('falls back to page 1', () => {
		for (const value of [null, undefined, '', ' ', '0', '-2', '1.5', 'abc', '2x', '1e3', '1 2'])
			expect(parsePage(value)).toBe(1);
	});
});

describe('pageWindow', () => {
	it('gives the first page of several', () => {
		expect(pageWindow(250, 1, 100)).toEqual({
			page: 1,
			pages: 3,
			size: 100,
			offset: 0,
			first: 1,
			last: 100
		});
	});

	it('gives a short last page', () => {
		expect(pageWindow(250, 3, 100)).toMatchObject({ page: 3, offset: 200, first: 201, last: 250 });
	});

	it('keeps an exact multiple on its last page', () => {
		expect(pageWindow(200, 2, 100)).toMatchObject({ page: 2, pages: 2, first: 101, last: 200 });
	});

	it('moves a page past the end to the last page', () => {
		expect(pageWindow(250, 9, 100)).toMatchObject({ page: 3, offset: 200 });
	});

	it('moves a page before the start to the first page', () => {
		expect(pageWindow(250, 0, 100)).toMatchObject({ page: 1, offset: 0 });
		expect(pageWindow(250, Number.NaN, 100)).toMatchObject({ page: 1, offset: 0 });
	});

	it('has one empty page for no rows', () => {
		expect(pageWindow(0, 4, 100)).toEqual({
			page: 1,
			pages: 1,
			size: 100,
			offset: 0,
			first: 0,
			last: 0
		});
	});

	it('covers every row exactly once across the pages', () => {
		const total = 9_424;
		const { pages } = pageWindow(total, 1, 100);
		let seen = 0;
		for (let page = 1; page <= pages; page++) {
			const w = pageWindow(total, page, 100);
			expect(w.first).toBe(seen + 1);
			seen = w.last;
		}
		expect(seen).toBe(total);
	});
});
