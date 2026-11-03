import { addDays } from '#lib/roster/cycle.js';

// Clearing a day state over a range (pay plan PR19, task 5.1). A state is an `absence` row, and
// rows are cancelled, never edited or deleted: a row that reaches past the cleared range is
// cancelled whole and its parts outside the range are recorded again as new rows. Pure, so the
// rule is tested without a database. Client-safe: no server imports.

export type StateRow = {
	id: string;
	startsOn: string;
	endsOn: string;
};

/** A part of a cancelled row that stays: dates `[startsOn, endsOn]`, copied from `from`. */
export type KeptPart<T extends StateRow> = { startsOn: string; endsOn: string; from: T };

export type ClearPlan<T extends StateRow> = {
	/** Rows that overlap the range: all of them are cancelled. */
	cancel: T[];
	/** Their parts before and after the range, to record again. */
	keep: KeptPart<T>[];
};

/** What clearing dates `[from, to]` does to these active rows (rows outside it are ignored). */
export function planClear<T extends StateRow>(
	rows: readonly T[],
	from: string,
	to: string
): ClearPlan<T> {
	const cancel = rows.filter((r) => r.startsOn <= to && r.endsOn >= from);
	const keep: KeptPart<T>[] = [];
	for (const row of cancel) {
		if (row.startsOn < from)
			keep.push({ startsOn: row.startsOn, endsOn: addDays(from, -1), from: row });
		if (row.endsOn > to) keep.push({ startsOn: addDays(to, 1), endsOn: row.endsOn, from: row });
	}
	return { cancel, keep };
}
