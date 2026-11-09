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

/** The fields a person is matched on in a list already loaded in the browser. */
type Searchable = Pick<PersonOption, 'employeeNo' | 'fullName' | 'fullNameAr'>;

/**
 * The people of an already loaded list whose employee number or name (English or Arabic) contains
 * the search, case-insensitive, in their list order; every person when the search is blank.
 */
export function filterPeople<T extends Searchable>(people: readonly T[], search: string): T[] {
	const q = personSearch(search)?.toLocaleLowerCase();
	if (!q) return [...people];
	return people.filter((person) =>
		[person.employeeNo, person.fullName, person.fullNameAr ?? ''].some((field) =>
			field.toLocaleLowerCase().includes(q)
		)
	);
}
