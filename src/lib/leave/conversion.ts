// Pure dated off-day leave-conversion override resolver (B2.3, TP32).
// No database, settings, schedule or ledger access; callers supply the versions and the date.

/**
 * One `off_day_leave_conversion` version: the company override applied to every employee's off-day
 * leave conversion from `effectiveFrom` (inclusive) to `effectiveTo` (exclusive). `minutes: null`
 * records an explicit "no override from this date" — the employee's normal workday minutes apply.
 */
export type OffDayConversionVersion = {
	id: string;
	/** Company override minutes; `null`: no override from this version on. */
	minutes: number | null;
	effectiveFrom: string;
	/** Exclusive; `null` while open. */
	effectiveTo: string | null;
};

/** `default`: no version is in force; `company`: an explicit version, cleared or not. */
export type OffDayConversionSource = 'default' | 'company';

export type ResolvedOffDayConversion = {
	/** The override in minutes, or `null` for the employee's normal workday minutes. */
	minutes: number | null;
	/** The version that produced this result; `null` when no version is in force. */
	versionId: string | null;
	source: OffDayConversionSource;
};

/**
 * The off-day conversion override in force on `date`. An active numeric or null version always
 * reports its own id and the `company` source, so an explicit clear stays explained. The caller's
 * versions may arrive in any order; this never mutates or sorts them.
 */
export function resolveOffDayConversion(
	versions: readonly OffDayConversionVersion[],
	date: string
): ResolvedOffDayConversion {
	const active = versions.find(
		(v) => v.effectiveFrom <= date && (v.effectiveTo === null || date < v.effectiveTo)
	);
	if (active === undefined) return { minutes: null, versionId: null, source: 'default' };
	return { minutes: active.minutes, versionId: active.id, source: 'company' };
}
