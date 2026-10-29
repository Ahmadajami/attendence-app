// Pattern slots as read from the DB. drizzle-orm (0.45) parses a `uuid[]` NULL element as the
// string "NULL" instead of `null`; an off day is not an error, so every BL that reads slots maps
// it back here before the engine, the pages or a validation see it.

/** `['a', 'NULL', null]` → `['a', null, null]`. */
export function normalizeSlots(slots: readonly (string | null)[]): (string | null)[] {
	return slots.map((slot) => (slot === null || slot.toUpperCase() === 'NULL' ? null : slot));
}

/** The row with its `slots` normalized. */
export function withSlots<T extends { slots: readonly (string | null)[] }>(row: T): T {
	return { ...row, slots: normalizeSlots(row.slots) };
}
