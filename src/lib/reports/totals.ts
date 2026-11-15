import { m } from '#lib/paraglide/messages.js';
import type { AbsenceType, DayKind, UnpaidReason } from '#lib/schemas/enums.js';

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

/** The sort keys the URL can name: the person's name, or any shown column (R1, RP1). */
export const TOTALS_SORT_KEYS = ['name', ...TOTALS_COLUMNS] as const;
export type TotalsSortKey = (typeof TOTALS_SORT_KEYS)[number];
export type TotalsSortDir = 'asc' | 'desc';
export type TotalsSort = { key: TotalsSortKey; dir: TotalsSortDir };

/** The default order: by name, ascending (RP1). */
export const DEFAULT_TOTALS_SORT: TotalsSort = { key: 'name', dir: 'asc' };

/** The longest search text kept from the URL. */
export const TOTALS_SEARCH_MAX = 100;

/** The sort the URL asks for; an unknown key or direction falls back to the default for that part. */
export function parseTotalsSort(key: string | null, dir: string | null): TotalsSort {
	const sortKey = (TOTALS_SORT_KEYS as readonly string[]).includes(key ?? '')
		? (key as TotalsSortKey)
		: DEFAULT_TOTALS_SORT.key;
	const sortDir: TotalsSortDir = dir === 'desc' ? 'desc' : 'asc';
	return { key: sortKey, dir: sortDir };
}

/** The search text from the URL: trimmed and cut to `TOTALS_SEARCH_MAX`; empty means no search. */
export function parseTotalsSearch(value: string | null): string {
	return (value ?? '').trim().slice(0, TOTALS_SEARCH_MAX);
}

/**
 * The overtime cap the URL asks for (R7): a percent of the required minutes. Blank, missing or not a
 * number from 0 up: `null`, which means no cap (RP17).
 */
export function parseTotalsCap(value: string | null): number | null {
	if (value === null || value.trim() === '') return null;
	const percent = Number(value);
	return Number.isFinite(percent) && percent >= 0 ? percent : null;
}

/**
 * The overtime minutes that count after the cap (RP10, RP17): with no cap, all of the eligible
 * minutes; with a cap, the smaller of them and required × cap ÷ 100, in whole minutes (rounded down).
 */
export function capOvertimeMinutes(
	eligibleMinutes: number,
	requiredMinutes: number,
	capPercent: number | null
): number {
	if (capPercent === null) return eligibleMinutes;
	return Math.min(eligibleMinutes, Math.floor((requiredMinutes * capPercent) / 100));
}

/**
 * Everything the report reads from its URL (page and Excel export alike, so both show the same
 * rows): the dates, the sort, the search text and the chosen columns. The scope is parsed by the
 * caller, since it needs the daily page's parser.
 */
export function parseTotalsParams(params: URLSearchParams) {
	return {
		from: params.get('from'),
		to: params.get('to'),
		sort: parseTotalsSort(params.get('sort'), params.get('dir')),
		q: parseTotalsSearch(params.get('q')),
		cap: parseTotalsCap(params.get('cap')),
		columns: params.getAll('col')
	};
}

/** A sort direction for the rows of the person sheet (R2): `desc` only when the URL says so. */
export function parseTotalsDir(value: string | null): TotalsSortDir {
	return value === 'desc' ? 'desc' : 'asc';
}

/** One stored day of a person, for the person sheet (R2). Absence type is left out on purpose (RP6). */
export type PersonDay = {
	shiftDate: string;
	shift: { code: string; nameEn: string; nameAr: string } | null;
	requiredMinutes: number;
	/** `null` until checked out. */
	workedMinutes: number | null;
	overtimeMinutes: number;
	paidOtMinutes: number;
	unpaidExtraMinutes: number;
	unpaidReason: UnpaidReason | null;
	/** The rate the paid overtime earns; `null` when nothing is paid. */
	otRate: number | null;
	lateMinutes: number;
	shortageMinutes: number;
};

/**
 * Why a day's overtime is what it is, as a message key (RP6): `paid` when some extra minutes are
 * paid; else the unpaid reason; `none` when there are no unpaid extra minutes either.
 */
export type OvertimeReasonKey = 'paid' | 'none' | UnpaidReason;

export function overtimeReason(
	day: Pick<PersonDay, 'paidOtMinutes' | 'unpaidExtraMinutes' | 'unpaidReason'>
): OvertimeReasonKey {
	if (day.paidOtMinutes > 0) return 'paid';
	if (day.unpaidExtraMinutes > 0 && day.unpaidReason !== null) return day.unpaidReason;
	return 'none';
}

export type PersonDayRow = PersonDay & { reason: OvertimeReasonKey };

/** The person's days with their reason, by date in `dir` order (asc: oldest first). */
export function personDayRows(days: readonly PersonDay[], dir: TotalsSortDir): PersonDayRow[] {
	const sorted = [...days].sort((a, b) =>
		a.shiftDate < b.shiftDate ? -1 : a.shiftDate > b.shiftDate ? 1 : 0
	);
	if (dir === 'desc') sorted.reverse();
	return sorted.map((day) => ({ ...day, reason: overtimeReason(day) }));
}
