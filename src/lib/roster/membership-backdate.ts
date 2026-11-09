import { parseDate } from '@internationalized/date';

// Backdating the memberships the employee import opened (plans/2026-11-09-operations-roster-nov-2026.md
// RO4). A team plan reaches a person only on dates their membership covers at 00:00, so memberships
// opened at the import instant leave every earlier day unplanned. Pure: no DB, no paraglide, so
// `scripts/backdate-import-memberships.ts` and Vitest can use it.

/** One `staff_team_membership` row, as the script reads it. */
export type MembershipRow = {
	id: string;
	staffId: string;
	validFrom: Date;
	validTo: Date | null;
};

export type MembershipMove = { id: string; staffId: string; before: Date; after: Date };

export type RefusedReason =
	/** The person has more than one membership row: a team move after the import. */
	| 'other_membership'
	/** The person's only membership is closed. */
	| 'closed'
	/** The new start would be later than the current one (it would unplan days). */
	| 'later_than_current';

export type BackdatePlan = {
	moves: MembershipMove[];
	/** Rows already starting at the new instant (a re-run). */
	unchanged: number;
	refused: { staffId: string; reason: RefusedReason }[];
	/** Distinct current `valid_from` values among the rows to move or keep (1 after one import). */
	currentStarts: number;
};

/**
 * 00:00 in `timeZone` on `date` (`YYYY-MM-DD`), or `null` when `date` is not a real calendar day
 * in that exact format.
 */
export function startOfDayIn(date: string, timeZone: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	try {
		const day = parseDate(date);
		return day.toString() === date ? day.toDate(timeZone) : null;
	} catch {
		return null;
	}
}

/**
 * Which membership rows of the imported people move to `from`. Only people with exactly one,
 * open membership row qualify; anyone else is refused (and the script then writes nothing). A
 * row already at `from` is unchanged, so the script can be re-run; an older `from` moves the same
 * rows again.
 */
export function planMembershipBackdate(
	rows: readonly MembershipRow[],
	importedStaffIds: ReadonlySet<string>,
	from: Date
): BackdatePlan {
	const byStaff = new Map<string, MembershipRow[]>();
	for (const row of rows) {
		if (!importedStaffIds.has(row.staffId)) continue;
		const list = byStaff.get(row.staffId);
		if (list) list.push(row);
		else byStaff.set(row.staffId, [row]);
	}

	const plan: BackdatePlan = { moves: [], unchanged: 0, refused: [], currentStarts: 0 };
	const starts = new Set<number>();
	for (const [staffId, list] of byStaff) {
		if (list.length > 1) {
			plan.refused.push({ staffId, reason: 'other_membership' });
			continue;
		}
		const [row] = list;
		if (row.validTo !== null) {
			plan.refused.push({ staffId, reason: 'closed' });
			continue;
		}
		const current = row.validFrom.getTime();
		if (from.getTime() > current) {
			plan.refused.push({ staffId, reason: 'later_than_current' });
			continue;
		}
		starts.add(current);
		if (from.getTime() === current) plan.unchanged += 1;
		else plan.moves.push({ id: row.id, staffId, before: row.validFrom, after: from });
	}
	plan.currentStarts = starts.size;
	return plan;
}
