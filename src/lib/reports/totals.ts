import { m } from '#lib/paraglide/messages.js';
import type { AbsenceType, DayKind } from '#lib/schemas/enums.js';

// The totals report `/reports` (task T1, decisions SP3, SP6): one row per person for any two dates,
// summed from `day_result`. Pure, so it is tested without a database; `reports.crud.ts` sums the
// same columns in SQL with the same meaning.

/** Two shift dates, inclusive. */
export type DateRange = { from: string; to: string };

const pad = (value: number) => String(value).padStart(2, '0');
const yearOf = (date: string) => Number(date.slice(0, 4));
const monthOf = (date: string) => Number(date.slice(5, 7));
const daysInMonth = (year: number, month: number) =>
	new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The calendar month of `anchor`: its first and last day. */
export function monthRange(anchor: string): DateRange {
	const year = yearOf(anchor);
	const month = monthOf(anchor);
	return {
		from: `${year}-${pad(month)}-01`,
		to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`
	};
}

/**
 * The 21 → 20 period of `anchor`'s month (SP6: no fixed pay month in the calculation; this is the
 * quick range HR asks for): the 21st of the previous month to the 20th of this one, across a year
 * boundary too.
 */
export function payMonthRange(anchor: string): DateRange {
	const year = yearOf(anchor);
	const month = monthOf(anchor);
	const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
	return { from: `${prev.year}-${pad(prev.month)}-21`, to: `${year}-${pad(month)}-20` };
}

/**
 * The shown range: exactly the asked dates, never changed. Only a missing date gets a default:
 * `to` today, `from` the 1st of `to`'s month (month to date).
 */
export function totalsRange(from: string | null, to: string | null, today: string): DateRange {
	const end = to ?? today;
	return { from: from ?? monthRange(end).from, to: end };
}

/** The columns a person's row can show, in the table's fixed order. */
export const TOTALS_COLUMNS = [
	'workDays',
	'requiredMinutes',
	'workedMinutes',
	'overtimeMinutes',
	'lateMinutes',
	'shortageMinutes',
	'leaveDays',
	'creditMinutes'
] as const;
export type TotalsColumn = (typeof TOTALS_COLUMNS)[number];

/** The columns shown when the URL names none (T1: work days, required, worked, overtime, late, shortage, leave). */
export const DEFAULT_TOTALS_COLUMNS: readonly TotalsColumn[] = [
	'workDays',
	'requiredMinutes',
	'workedMinutes',
	'overtimeMinutes',
	'lateMinutes',
	'shortageMinutes',
	'leaveDays'
];

/** The columns shown as a day count; the rest are minutes. */
export const COUNT_COLUMNS: readonly TotalsColumn[] = ['workDays', 'leaveDays'];

/** A column's heading (the table head and the Excel header). */
export const TOTALS_COLUMN_LABEL: Record<TotalsColumn, () => string> = {
	workDays: m.reports_col_work_days,
	requiredMinutes: m.reports_col_required,
	workedMinutes: m.reports_col_worked,
	overtimeMinutes: m.reports_col_overtime,
	lateMinutes: m.reports_col_late,
	shortageMinutes: m.reports_col_shortage,
	leaveDays: m.reports_col_leave,
	creditMinutes: m.reports_col_credit
};

/**
 * The columns the URL names, in the table's fixed order; unknown names are ignored. None, or only
 * unknown ones: the defaults.
 */
export function parseTotalsColumns(values: Iterable<string>): TotalsColumn[] {
	const asked = new Set<string>();
	for (const value of values)
		if ((TOTALS_COLUMNS as readonly string[]).includes(value)) asked.add(value);
	return asked.size === 0
		? [...DEFAULT_TOTALS_COLUMNS]
		: TOTALS_COLUMNS.filter((column) => asked.has(column));
}

/** The day values a person's row is summed from (the `day_result` columns the report uses). */
export type TotalsDay = {
	kind: DayKind;
	absenceType: AbsenceType | null;
	requiredMinutes: number;
	/** `null` until checked out. */
	workedMinutes: number | null;
	overtimeMinutes: number;
	lateMinutes: number;
	shortageMinutes: number;
	creditMinutes: number;
};

/** One person's row: the sums of their stored days between the two dates. */
export type PersonTotals = {
	workDays: number;
	leaveDays: number;
	requiredMinutes: number;
	workedMinutes: number;
	overtimeMinutes: number;
	lateMinutes: number;
	shortageMinutes: number;
	creditMinutes: number;
};

const EMPTY_TOTALS: PersonTotals = {
	workDays: 0,
	leaveDays: 0,
	requiredMinutes: 0,
	workedMinutes: 0,
	overtimeMinutes: 0,
	lateMinutes: 0,
	shortageMinutes: 0,
	creditMinutes: 0
};

/**
 * Sums one person's days into their row: work days are `kind = 'work'`, leave days a set full-day
 * state (`absence_type`, whatever the kind); a day not yet checked out contributes no worked time.
 * The SQL of `listTotalsPeople` keeps the same meaning.
 */
export function sumTotalsDays(days: readonly TotalsDay[]): PersonTotals {
	const totals: PersonTotals = { ...EMPTY_TOTALS };
	for (const day of days) {
		if (day.kind === 'work') totals.workDays += 1;
		if (day.absenceType !== null) totals.leaveDays += 1;
		totals.requiredMinutes += day.requiredMinutes;
		totals.workedMinutes += day.workedMinutes ?? 0;
		totals.overtimeMinutes += day.overtimeMinutes;
		totals.lateMinutes += day.lateMinutes;
		totals.shortageMinutes += day.shortageMinutes;
		totals.creditMinutes += day.creditMinutes;
	}
	return totals;
}
