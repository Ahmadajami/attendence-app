import { z } from 'zod';
import {
	parseTotalsColumns,
	payCoefficients,
	personDayRows,
	totalsRange,
	type PersonDayRow,
	type TotalsColumn,
	type TotalsSort,
	type TotalsSortDir
} from '#lib/reports/totals.js';
import { todayInDamascus } from '#lib/server/time.js';
import { scopeOptions, type EntryScope, type ScopeOptions } from '../attendance/attendance.bl.js';
import { requireActorPermission, type Actor } from '../common.js';
import type { PersonOption } from '#lib/attendance/person-search.js';
import {
	getPerson,
	listPayDays,
	listPersonDays,
	listTotalsPeople,
	type TotalsPersonRow
} from './reports.crud.js';

/** A person's row with the two pay coefficients of their days (R6): pay = (salary ÷ 30) × coefficient. */
export type PayRow = TotalsPersonRow & {
	pay: { overtime: number; shortage: number; credit: number };
};

// The totals report service (task T1, decisions SP3, SP6): the page's and the Excel export's rows.
// One row per person for any two dates and a scope, read-only. Viewing needs `staff.write`, the
// same permission as the daily page.

export type TotalsFilter = {
	from: string | null;
	to: string | null;
	scope: EntryScope;
	/** The column names the URL asks for; unknown ones are ignored by `parseTotalsColumns`. */
	columns: readonly string[];
	/** The order of the rows (R1); the default is by name. */
	sort: TotalsSort;
	/** The search text, already trimmed (R1): name or employee number. Empty: no search. */
	q: string;
	/** The overtime cap in percent of the required minutes (R7); `null`: no cap. */
	cap: number | null;
	/** One picked person (the report shows only their row); `null`: everyone. */
	staffId: string | null;
};

export type TotalsPage = ScopeOptions & {
	/** The shown shift dates `[from, to]`: exactly the asked ones, or this month up to today. */
	from: string;
	to: string;
	today: string;
	scope: EntryScope;
	/** The shown columns, in the table's fixed order. */
	columns: TotalsColumn[];
	sort: TotalsSort;
	q: string;
	cap: number | null;
	staffId: string | null;
	/** The picked person for the combobox's label, if one is picked. */
	person: PersonOption | null;
	rows: PayRow[];
};

const isDate = (value: string | null): value is string =>
	value !== null && z.iso.date().safeParse(value).success;

/** The totals page: the scope picker's options, the chosen columns and one summed row per person. */
export async function getTotals(actor: Actor, filter: TotalsFilter): Promise<TotalsPage> {
	requireActorPermission(actor, 'staff.write');
	const today = todayInDamascus();
	const { from, to } = totalsRange(
		isDate(filter.from) ? filter.from : null,
		isDate(filter.to) ? filter.to : null,
		today
	);
	const [options, rows, person, payDays] = await Promise.all([
		scopeOptions(),
		listTotalsPeople(from, to, filter.scope, filter.sort, filter.q, filter.cap, filter.staffId),
		filter.staffId ? getPerson(filter.staffId) : undefined,
		listPayDays(from, to, filter.scope)
	]);
	const payRows: PayRow[] = rows.map((row) => {
		const c = payCoefficients(payDays.get(row.person.staffId) ?? [], filter.cap);
		return { ...row, pay: { overtime: c.overtime, shortage: c.shortage, credit: c.credit } };
	});
	return {
		...options,
		from,
		to,
		today,
		scope: filter.scope,
		columns: parseTotalsColumns(filter.columns),
		sort: filter.sort,
		q: filter.q,
		cap: filter.cap,
		staffId: filter.staffId,
		person: person ?? null,
		rows: payRows
	};
}

/** The person sheet (R2): one person's days in the range, with their reason, and the sort. */
export type PersonSheet = {
	person: PersonOption;
	dir: TotalsSortDir;
	days: PersonDayRow[];
};

/**
 * One person's days in `[from, to]` and the scope (the same scope as the table), by date in `dir`
 * order. Read-only, `staff.write`. `null` when there is no such person.
 */
export async function getPersonDays(
	actor: Actor,
	filter: { staffId: string; from: string; to: string; scope: EntryScope; dir: TotalsSortDir }
): Promise<PersonSheet | null> {
	requireActorPermission(actor, 'staff.write');
	const [person, days] = await Promise.all([
		getPerson(filter.staffId),
		listPersonDays(filter.staffId, filter.from, filter.to, filter.scope)
	]);
	if (!person) return null;
	return { person, dir: filter.dir, days: personDayRows(days, filter.dir) };
}
