import { z } from 'zod';
import { parseTotalsColumns, totalsRange, type TotalsColumn } from '#lib/reports/totals.js';
import { todayInDamascus } from '#lib/server/time.js';
import { scopeOptions, type EntryScope, type ScopeOptions } from '../attendance/attendance.bl.js';
import { requireActorPermission, type Actor } from '../common.js';
import { listTotalsPeople, type TotalsPersonRow } from './reports.crud.js';

// The totals report service (task T1, decisions SP3, SP6): the page's and the Excel export's rows.
// One row per person for any two dates and a scope, read-only. Viewing needs `staff.write`, the
// same permission as the daily page.

export type TotalsFilter = {
	from: string | null;
	to: string | null;
	scope: EntryScope;
	/** The column names the URL asks for; unknown ones are ignored by `parseTotalsColumns`. */
	columns: readonly string[];
};

export type TotalsPage = ScopeOptions & {
	/** The shown shift dates `[from, to]`: exactly the asked ones, or this month up to today. */
	from: string;
	to: string;
	today: string;
	scope: EntryScope;
	/** The shown columns, in the table's fixed order. */
	columns: TotalsColumn[];
	rows: TotalsPersonRow[];
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
	const [options, rows] = await Promise.all([
		scopeOptions(),
		listTotalsPeople(from, to, filter.scope)
	]);
	return {
		...options,
		from,
		to,
		today,
		scope: filter.scope,
		columns: parseTotalsColumns(filter.columns),
		rows
	};
}
