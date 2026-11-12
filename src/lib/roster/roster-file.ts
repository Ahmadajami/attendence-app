// The roster import's two files (plan 2026-11-12-roster-import, RI2, RI3): a shifts file, and a
// month grid of person × date → shift code or `O`. Pure readers: header names are matched without
// case; the upload parser (`#lib/server/imports/parse`) gives every cell as text.
import { shiftFormSchema, type ShiftInput } from '#lib/schemas/shift.schema.js';
import { SHIFT_COLOURS } from '#lib/schemas/enums.js';

/** The uploaded table: header names and each row's cells as text. */
export type FileTable = {
	headers: readonly string[];
	rows: readonly { rowNo: number; values: readonly string[] }[];
};

export class MissingColumnError extends Error {
	constructor(readonly header: string) {
		super(`The file has no "${header}" column.`);
	}
}

export const SHIFT_FILE_HEADERS = {
	code: 'Code',
	nameEn: 'Name EN',
	nameAr: 'Name AR',
	start: 'Start',
	end: 'End',
	required: 'Required minutes',
	break: 'Break minutes',
	colour: 'Colour'
} as const;

export type ShiftLine = { line: number; shift: ShiftInput };
export type ShiftLineIssue = { line: number; code: string; field: string };

function columnsOf(headers: readonly string[]) {
	const lower = headers.map((h) => h.trim().toLowerCase());
	return (name: string, required = true) => {
		const index = lower.indexOf(name.toLowerCase());
		if (index < 0 && required) throw new MissingColumnError(name);
		return index;
	};
}

const cellOf = (values: readonly string[], index: number) =>
	index < 0 ? '' : (values[index] ?? '').trim();

/** `HH:mm`, `H:mm` or an Excel time read as `1899-12-30THH:mm:ss`. */
function clockText(text: string): string {
	const excel = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(text);
	if (excel) return `${excel[1]}:${excel[2]}`;
	const short = /^(\d):(\d{2})$/.exec(text);
	return short ? `0${short[1]}:${short[2]}` : text;
}

const numberOf = (text: string): number | null => (text === '' ? null : Number(text));

/**
 * Shifts, one per line, checked with the shift form's own rules (code `A–Z0–9` up to 3, times
 * `HH:mm`, minutes in range). A colour that isn't a palette key falls back to the first; a code
 * twice in the file is an issue on the second line.
 */
export function readShiftFile(table: FileTable): { lines: ShiftLine[]; issues: ShiftLineIssue[] } {
	const column = columnsOf(table.headers);
	const at = {
		code: column(SHIFT_FILE_HEADERS.code),
		nameEn: column(SHIFT_FILE_HEADERS.nameEn),
		nameAr: column(SHIFT_FILE_HEADERS.nameAr),
		start: column(SHIFT_FILE_HEADERS.start),
		end: column(SHIFT_FILE_HEADERS.end),
		required: column(SHIFT_FILE_HEADERS.required),
		break: column(SHIFT_FILE_HEADERS.break, false),
		colour: column(SHIFT_FILE_HEADERS.colour, false)
	};
	const lines: ShiftLine[] = [];
	const issues: ShiftLineIssue[] = [];
	const seen = new Set<string>();
	for (const { rowNo: line, values } of table.rows) {
		const code = cellOf(values, at.code).toUpperCase();
		if (code === '' && values.every((v) => v.trim() === '')) continue;
		const colour = cellOf(values, at.colour);
		const parsed = shiftFormSchema.safeParse({
			code,
			nameEn: cellOf(values, at.nameEn),
			nameAr: cellOf(values, at.nameAr),
			colour: (SHIFT_COLOURS as readonly string[]).includes(colour) ? colour : SHIFT_COLOURS[0],
			startTime: clockText(cellOf(values, at.start)),
			endTime: clockText(cellOf(values, at.end)),
			breakMinutes: numberOf(cellOf(values, at.break)) ?? 0,
			requiredMinutes: numberOf(cellOf(values, at.required))
		});
		if (!parsed.success) {
			const field = String(parsed.error.issues[0]?.path[0] ?? 'row');
			issues.push({ line, code: 'invalid', field });
			continue;
		}
		if (seen.has(parsed.data.code)) {
			issues.push({ line, code: 'duplicate_in_file', field: 'code' });
			continue;
		}
		seen.add(parsed.data.code);
		const shift: ShiftInput = { ...parsed.data };
		delete (shift as { shiftId?: string }).shiftId;
		lines.push({ line, shift });
	}
	return { lines, issues };
}

export const ROSTER_FILE_HEADERS = {
	employeeNo: 'Employee No',
	department: 'Department',
	team: 'Team'
} as const;

/** `O` is a day off; an empty cell is no plan that day. */
export const OFF_CODE = 'O';

export type GridLine = {
	line: number;
	employeeNo: string;
	department: string;
	team: string;
	/** One per `dates` entry: a shift code, `O`, or `''`. */
	codes: string[];
};

export type GridIssue = { line: number; code: 'no_employee' | 'no_group' };

export class GridDatesError extends Error {
	constructor(readonly reason: 'none' | 'month' | 'gap') {
		super(`The date columns are not one month of consecutive dates (${reason}).`);
	}
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` header, or an Excel date header read as `YYYY-MM-DDT00:00:00`. */
function headerDate(header: string): string | null {
	const text = header.trim().slice(0, 10);
	return DATE.test(text) ? text : null;
}

const nextDay = (date: string) => {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
};

/**
 * The month grid: `Employee No`, `Department`, `Team`, then one column per date (consecutive, in one
 * calendar month). Cells are upper-cased; a line with no employee number, or with neither a
 * department nor a team, is an issue. Empty lines are skipped.
 */
export function readRosterGrid(table: FileTable): {
	dates: string[];
	lines: GridLine[];
	issues: GridIssue[];
} {
	const column = columnsOf(table.headers);
	const at = {
		employeeNo: column(ROSTER_FILE_HEADERS.employeeNo),
		department: column(ROSTER_FILE_HEADERS.department, false),
		team: column(ROSTER_FILE_HEADERS.team, false)
	};
	const dateColumns = table.headers
		.map((h, index) => ({ date: headerDate(h), index }))
		.filter((c): c is { date: string; index: number } => c.date !== null)
		.sort((a, b) => a.date.localeCompare(b.date));
	if (dateColumns.length === 0) throw new GridDatesError('none');
	if (new Set(dateColumns.map((c) => c.date.slice(0, 7))).size > 1)
		throw new GridDatesError('month');
	for (let i = 1; i < dateColumns.length; i++)
		if (dateColumns[i].date !== nextDay(dateColumns[i - 1].date)) throw new GridDatesError('gap');

	const lines: GridLine[] = [];
	const issues: GridIssue[] = [];
	for (const { rowNo: line, values } of table.rows) {
		if (values.every((v) => v.trim() === '')) continue;
		const employeeNo = cellOf(values, at.employeeNo);
		const department = cellOf(values, at.department);
		const team = cellOf(values, at.team);
		if (employeeNo === '') issues.push({ line, code: 'no_employee' });
		else if (department === '' && team === '') issues.push({ line, code: 'no_group' });
		else
			lines.push({
				line,
				employeeNo,
				department,
				team,
				codes: dateColumns.map((c) => cellOf(values, c.index).toUpperCase())
			});
	}
	return { dates: dateColumns.map((c) => c.date), lines, issues };
}
