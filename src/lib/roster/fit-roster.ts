import { patternSlot } from './cycle.js';

// Fitting HR's monthly roster workbooks to a cycle pattern (plans/2026-11-09-operations-roster-nov-2026.md
// Phase 2). A workbook row is one person's month of codes; this finds the crew start (B4) that
// reproduces it, the days that don't fit, and pairs of people whose odd days are an employee swap
// (R12). Pure: no DB, no paraglide; `scripts/check-team-roster.ts` and Vitest use it.

/** A shift code on a day; `null` = off. */
export type DayCode = string | null;
/** One workbook row: a code per day of the month, `undefined` when the cell is empty. */
export type RowCells = readonly (DayCode | undefined)[];

/** The cycle's slots as shift codes (`null` = off) and its slot-0 date. */
export type CycleCodes = { slots: readonly DayCode[]; anchorDate: string };

export type Miss = { date: string; expected: DayCode; got: DayCode };

export type RowFit = {
	/** The crew starts with the fewest misses (more than one: the row can't tell them apart). */
	crewStarts: number[];
	/** Days of the first best crew start that differ from the row. */
	misses: Miss[];
	/** Days with an empty cell (not compared). */
	missing: string[];
};

/** The cycle's code on `date` for a crew start. */
export function plannedCode(cycle: CycleCodes, date: string, crewStart: number): DayCode {
	return patternSlot({ type: 'cycle', ...cycle }, date, crewStart);
}

function missesFor(
	cycle: CycleCodes,
	dates: readonly string[],
	cells: RowCells,
	crewStart: number
): Miss[] {
	const misses: Miss[] = [];
	dates.forEach((date, i) => {
		const got = cells[i];
		if (got === undefined) return;
		const expected = plannedCode(cycle, date, crewStart);
		if (expected !== got) misses.push({ date, expected, got });
	});
	return misses;
}

/** The crew start(s) that reproduce `cells` on `dates` best. */
export function fitRow(cycle: CycleCodes, dates: readonly string[], cells: RowCells): RowFit {
	const missing = dates.filter((_, i) => cells[i] === undefined);
	let best: { crewStart: number; misses: Miss[] }[] = [];
	for (let crewStart = 0; crewStart < cycle.slots.length; crewStart++) {
		const misses = missesFor(cycle, dates, cells, crewStart);
		if (best.length === 0 || misses.length < best[0].misses.length) best = [{ crewStart, misses }];
		else if (misses.length === best[0].misses.length) best.push({ crewStart, misses });
	}
	return {
		crewStarts: best.map((b) => b.crewStart),
		misses: best[0]?.misses ?? [],
		missing
	};
}

/** A row with the crew start chosen for it. */
export type FittedRow<K> = { key: K; crewStart: number; cells: RowCells };

/**
 * An employee swap that explains odd days (R12, `swapOverrides`): on `date` A works their planned
 * shift no more and B (off) works it; on `returnDate` B is off and A works B's shift.
 */
export type SwapSuggestion<K> = { a: K; b: K; date: string; returnDate: string | null };

export type SwapFit<K> = {
	swaps: SwapSuggestion<K>[];
	/** Odd days no swap explains. */
	unexplained: (Miss & { key: K })[];
};

/**
 * Pairs of rows whose odd days are each other's planned days: on such a date each person has what
 * the other was planned to have, one of them working and the other off. Each pair's dates where A
 * was planned to work are paired, in date order, with the dates where B was; A is the person
 * planned to work on the pair's first date. Every other odd day is unexplained.
 */
export function findSwaps<K>(
	cycle: CycleCodes,
	dates: readonly string[],
	rows: readonly FittedRow<K>[]
): SwapFit<K> {
	const index = new Map(dates.map((date, i) => [date, i]));
	const plan = (row: FittedRow<K>, date: string) => plannedCode(cycle, date, row.crewStart);
	const got = (row: FittedRow<K>, date: string) => row.cells[index.get(date)!];
	const odd = rows.map((row) => missesFor(cycle, dates, row.cells, row.crewStart));

	const explained = rows.map(() => new Set<string>());
	/** Per pair of row positions: the dates each one was planned to work. */
	const pairs = new Map<string, { i: number; j: number; iWorks: string[]; jWorks: string[] }>();
	rows.forEach((row, i) => {
		for (const miss of odd[i]) {
			if (explained[i].has(miss.date)) continue;
			const j = rows.findIndex(
				(other, k) =>
					k !== i &&
					!explained[k].has(miss.date) &&
					got(other, miss.date) !== undefined &&
					got(row, miss.date) === plan(other, miss.date) &&
					got(other, miss.date) === plan(row, miss.date) &&
					(plan(row, miss.date) === null) !== (plan(other, miss.date) === null)
			);
			if (j < 0) continue;
			explained[i].add(miss.date);
			explained[j].add(miss.date);
			const id = i < j ? `${i}:${j}` : `${j}:${i}`;
			const pair = pairs.get(id) ?? {
				i: Math.min(i, j),
				j: Math.max(i, j),
				iWorks: [],
				jWorks: []
			};
			const iWorks = plan(rows[pair.i], miss.date) !== null;
			(iWorks ? pair.iWorks : pair.jWorks).push(miss.date);
			pairs.set(id, pair);
		}
	});

	const swaps: SwapSuggestion<K>[] = [];
	for (const pair of pairs.values()) {
		pair.iWorks.sort();
		pair.jWorks.sort();
		const iFirst = (pair.iWorks[0] ?? '9999') <= (pair.jWorks[0] ?? '9999');
		const [a, b, aWorks, bWorks] = iFirst
			? [rows[pair.i].key, rows[pair.j].key, pair.iWorks, pair.jWorks]
			: [rows[pair.j].key, rows[pair.i].key, pair.jWorks, pair.iWorks];
		aWorks.forEach((date, n) => swaps.push({ a, b, date, returnDate: bWorks[n] ?? null }));
		// More dates where B worked than A: B is the asking person on those.
		for (const date of bWorks.slice(aWorks.length))
			swaps.push({ a: b, b: a, date, returnDate: null });
	}
	swaps.sort((x, y) => x.date.localeCompare(y.date));

	const unexplained = rows.flatMap((row, i) =>
		odd[i].filter((miss) => !explained[i].has(miss.date)).map((miss) => ({ ...miss, key: row.key }))
	);
	return { swaps, unexplained };
}

/** One person row of a workbook, before matching it to a staff record. */
export type WorkbookRow = { row: number; employeeNo: string; cells: RowCells };

export type WorkbookIssue =
	| { code: 'unknown_code'; row: number; day: number; value: string }
	| { code: 'no_employee_no'; row: number };

/** A spreadsheet cell as `read-excel-file` returns it. */
export type SheetCell = string | number | boolean | Date | null | undefined;

const text = (cell: SheetCell) =>
	cell === null || cell === undefined ? '' : cell instanceof Date ? '' : String(cell).trim();

/**
 * The person rows of a roster sheet: column A the employee number, column B the name (never read),
 * columns C… the days 1…`days` by position (the header is not trusted). `codes` maps a workbook
 * code (upper case) to a shift code, or to `null` for an off day. A row counts as a person row when
 * column A holds digits; a row with roster codes but no number is reported.
 */
export function readWorkbookRows(
	sheet: readonly (readonly SheetCell[])[],
	days: number,
	codes: ReadonlyMap<string, DayCode>
): { rows: WorkbookRow[]; issues: WorkbookIssue[] } {
	const rows: WorkbookRow[] = [];
	const issues: WorkbookIssue[] = [];
	sheet.forEach((line, i) => {
		const row = i + 1;
		const dayCells = Array.from({ length: days }, (_, d) => text(line[2 + d]).toUpperCase());
		const employeeNo = text(line[0]).replace(/\.0+$/, '');
		if (!/^\d+$/.test(employeeNo)) {
			if (dayCells.some((value) => value !== '' && codes.has(value)))
				issues.push({ code: 'no_employee_no', row });
			return;
		}
		const cells = dayCells.map((value, d): DayCode | undefined => {
			if (value === '') return undefined;
			if (codes.has(value)) return codes.get(value)!;
			issues.push({ code: 'unknown_code', row, day: d + 1, value });
			return undefined;
		});
		rows.push({ row, employeeNo, cells });
	});
	return { rows, issues };
}

/** Filled days of a row. */
export function filledDays(cells: RowCells): number {
	return cells.filter((cell) => cell !== undefined).length;
}

/**
 * Rows that share an employee number: the one with the most filled days is kept (the first on a
 * tie); the others are returned as duplicates of it.
 */
export function dropDuplicateRows(rows: readonly WorkbookRow[]): {
	kept: WorkbookRow[];
	duplicates: { row: number; of: number; filled: number }[];
} {
	const byNo = new Map<string, WorkbookRow[]>();
	for (const row of rows) byNo.set(row.employeeNo, [...(byNo.get(row.employeeNo) ?? []), row]);
	const kept: WorkbookRow[] = [];
	const duplicates: { row: number; of: number; filled: number }[] = [];
	for (const group of byNo.values()) {
		const keep = group.reduce((a, b) => (filledDays(b.cells) > filledDays(a.cells) ? b : a));
		kept.push(keep);
		for (const other of group)
			if (other !== keep)
				duplicates.push({ row: other.row, of: keep.row, filled: filledDays(other.cells) });
	}
	kept.sort((x, y) => x.row - y.row);
	return { kept, duplicates };
}
