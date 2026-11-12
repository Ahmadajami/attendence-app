// Which recomputes the catch-up runs for the flagged days (pay plan PR17). Pure, so it is tested
// without a database.

export type FlaggedDay = { staffId: string; shiftDate: string };

export type CatchUpRange = { from: string; to: string; staffIds: string[] };

/**
 * One recompute per distinct range: each person's range runs from their first to their last
 * flagged date, and people with the same range are recomputed together (one roster load for the
 * group instead of one per person). Ranges come oldest first.
 */
export function catchUpRanges(flagged: readonly FlaggedDay[]): CatchUpRange[] {
	const byStaff = new Map<string, { from: string; to: string }>();
	for (const { staffId, shiftDate } of flagged) {
		const range = byStaff.get(staffId);
		byStaff.set(staffId, {
			from: range && range.from < shiftDate ? range.from : shiftDate,
			to: range && range.to > shiftDate ? range.to : shiftDate
		});
	}
	const byRange = new Map<string, CatchUpRange>();
	for (const [staffId, { from, to }] of byStaff) {
		const key = `${from}|${to}`;
		const group = byRange.get(key);
		if (group) group.staffIds.push(staffId);
		else byRange.set(key, { from, to, staffIds: [staffId] });
	}
	return [...byRange.values()].sort(
		(a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)
	);
}
