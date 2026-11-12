/**
 * JSON text with object keys sorted at every level: two values that hold the same data give the
 * same text, whatever order their keys were written in. PostgreSQL `jsonb` reorders keys, so a
 * stored preview must be compared this way with a freshly built one.
 */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === 'object')
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
		);
	return value;
}
