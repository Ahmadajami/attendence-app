import { z } from 'zod';
// Page arithmetic for lists paged in SQL with LIMIT / OFFSET. Pure, so it is tested without a
// database.

/** `?page=<n>`: a whole number from 1; anything else is page 1. */

/** `?page=<n>`: a whole number from 1; anything else is page 1. */
export function parsePage(value: string | null | undefined): number {
	const schema = z
		.string()
		.trim()
		.regex(/^[0-9]{1,9}$/, 'Must be a positive integer')
		.transform(Number)
		.pipe(z.number().int().min(1));

	const result = schema.safeParse(value);

	return result.success ? result.data : 1;
}

export type PageWindow = {
	/** The shown page, from 1; an asked page past the end becomes the last one. */
	page: number;
	/** How many pages there are; 1 for an empty list. */
	pages: number;
	size: number;
	/** Rows to skip (SQL `OFFSET`). */
	offset: number;
	/** Position of the page's first and last row, from 1; both 0 for an empty list. */
	first: number;
	last: number;
};

/** The window of `page` over `total` rows, `size` rows a page. */
export function pageWindow(total: number, page: number, size: number): PageWindow {
	const pages = Math.max(1, Math.ceil(total / size));
	const shown = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
	const offset = (shown - 1) * size;
	return {
		page: shown,
		pages,
		size,
		offset,
		first: total === 0 ? 0 : offset + 1,
		last: Math.min(total, offset + size)
	};
}
