import type { LogCause, LogSource } from '#lib/schemas/enums.js';
import {
	dayResultHash,
	diffDayResult,
	type DayChange,
	type DayResultValues
} from './day-result.js';

// What a recompute writes (pay plan PR17, PR21–PR23). Pure: the day-results service loads the stored
// rows, computes the new values with `dayResultOf`, and writes what this plan says, the rows and
// their log lines in the same transaction.

/** A stored `day_result` row as the planner sees it. */
export type StoredDay = { values: DayResultValues; hash: string; needsRecompute: boolean };

/** Why the days are recomputed (PR23): the source and the record behind it, and who did it. */
export type RecomputeCause = {
	source: LogSource;
	causeType: LogCause;
	/** `null` with `causeType: 'none'`. */
	causeId: string | null;
	/** `null`: the system (backfill, catch-up). */
	actorId: string | null;
};

export const SYSTEM_CAUSE: RecomputeCause = Object.freeze({
	source: 'system',
	causeType: 'none',
	causeId: null,
	actorId: null
});

/** One cause for every day, or one per person and date (e.g. each person's own punch). */
export type CauseOf = RecomputeCause | ((staffId: string, shiftDate: string) => RecomputeCause);

export type LogLine = DayChange & RecomputeCause & { staffId: string; shiftDate: string };

export type RecomputePlan = {
	/** Rows to upsert (new, changed, or flagged and now cleared), with their hash. */
	write: { values: DayResultValues; hash: string }[];
	/** Edit-log lines for the written rows that changed. */
	logs: LogLine[];
	/** Rows already right and not flagged: nothing written. */
	kept: number;
};

export const dayKey = (staffId: string, shiftDate: string) => `${staffId}|${shiftDate}`;

/**
 * Compare each computed day with its stored row. Same hash and not flagged: kept. Same hash but
 * flagged: rewritten to clear the flag, no log line. Different hash: rewritten with one log line per
 * changed value. Not stored yet: written with a `created` line.
 */
export function planRecompute(
	stored: ReadonlyMap<string, StoredDay>,
	computed: readonly DayResultValues[],
	cause: CauseOf
): RecomputePlan {
	const plan: RecomputePlan = { write: [], logs: [], kept: 0 };
	for (const values of computed) {
		const hash = dayResultHash(values);
		const previous = stored.get(dayKey(values.staffId, values.shiftDate));
		if (previous && previous.hash === hash) {
			if (previous.needsRecompute) plan.write.push({ values, hash });
			else plan.kept++;
			continue;
		}
		plan.write.push({ values, hash });
		const why = typeof cause === 'function' ? cause(values.staffId, values.shiftDate) : cause;
		for (const change of diffDayResult(previous?.values ?? null, values))
			plan.logs.push({ ...change, ...why, staffId: values.staffId, shiftDate: values.shiftDate });
	}
	return plan;
}
