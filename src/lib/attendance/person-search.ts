// The daily page's person search (pay plan PR42): a name (English or Arabic) or employee number,
// matched as "contains", case-insensitive.

/** A person as the person combobox lists them (PR45). */
export type PersonOption = {
	staffId: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
};

/** The longest search the page accepts. */
export const MAX_PERSON_SEARCH = 80;

/** The trimmed search, or `null` when empty or not a string. Longer input is cut. */
export function personSearch(value: string | null | undefined): string | null {
	const q = (value ?? '').trim().slice(0, MAX_PERSON_SEARCH);
	return q === '' ? null : q;
}

/** A SQL `LIKE` / `ILIKE` "contains" pattern: `%`, `_` and `\` in the search match themselves. */
export function containsPattern(q: string): string {
	return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
