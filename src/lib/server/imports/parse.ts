import { readSheet } from 'read-excel-file/node';
import { m } from '#lib/paraglide/messages.js';
import { toAsciiDigits } from '#lib/schemas/auth.schema.js';
import { AppError, InvalidInputError } from '#lib/server/errors.js';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2_000;

export type RawTable = {
	headers: string[];
	rows: { rowNo: number; values: string[]; raw: Record<string, string> }[];
};

const pad = (value: number) => String(value).padStart(2, '0');

/** Excel date cells describe a wall-clock value; keep its fields instead of shifting by a zone. */
function dateCell(value: Date): string {
	return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(
		value.getUTCHours()
	)}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

function cellText(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date) return dateCell(value);
	if (typeof value === 'string') return toAsciiDigits(value).trim();
	return toAsciiDigits(String(value)).trim();
}

function buildTable(headers: string[], rows: { rowNo: number; values: string[] }[]): RawTable {
	const cleanHeaders = headers.map((header) => header.trim());
	if (cleanHeaders.every((header) => !header))
		throw new InvalidInputError('empty', m.imports_error_empty());

	const kept = rows
		.map((row) => ({ ...row, values: row.values.map(cellText) }))
		.filter((row) => row.values.some((value) => value !== ''));

	if (kept.length > MAX_IMPORT_ROWS) {
		throw new InvalidInputError('too_many_rows', m.imports_error_too_many_rows());
	}

	return {
		headers: cleanHeaders,
		rows: kept.map((row) => ({
			...row,
			raw: Object.fromEntries(
				cleanHeaders.map((header, index) => [
					header || `column ${index + 1}`,
					row.values[index] ?? ''
				])
			)
		}))
	};
}

function fromSheetData(data: unknown[][]): RawTable {
	const cells = data.map((row) => (row ?? []).map(cellText));
	const headerIndex = cells.findIndex((row) => row.some((cell) => cell !== ''));
	if (headerIndex < 0) throw new InvalidInputError('empty', m.imports_error_empty());

	const headers = cells[headerIndex];
	return buildTable(
		headers,
		cells.slice(headerIndex + 1).map((values, index) => ({
			rowNo: headerIndex + index + 2,
			values
		}))
	);
}

function splitRow(line: string): string[] {
	let value = line.trim();
	if (value.startsWith('|')) value = value.slice(1);
	if (value.endsWith('|')) value = value.slice(0, -1);
	return value.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

const SEPARATOR_CELL = /^:?-{3,}:?$/;

export function parseMarkdownTable(text: string): RawTable {
	const lines = text.split(/\r?\n/);

	for (let start = 0; start < lines.length - 1; start++) {
		const headerLine = lines[start];
		const separatorLine = lines[start + 1];
		if (!headerLine.includes('|') || !separatorLine.includes('|')) continue;

		const separatorCells = splitRow(separatorLine);
		if (separatorCells.length === 0 || !separatorCells.every((cell) => SEPARATOR_CELL.test(cell))) {
			continue;
		}

		const headers = splitRow(headerLine);
		const rows: { rowNo: number; values: string[] }[] = [];
		for (let index = start + 2; index < lines.length; index++) {
			const line = lines[index];
			if (!line.includes('|')) break;
			rows.push({ rowNo: index + 1, values: splitRow(line) });
		}
		return buildTable(headers, rows);
	}

	throw new InvalidInputError('empty', m.imports_error_empty());
}

/** Pick `.xlsx` or Markdown by extension, enforce the byte cap and return a normalised table. */
export async function parseUpload(file: File): Promise<RawTable> {
	if (file.size > MAX_IMPORT_BYTES) {
		throw new AppError(413, 'file_too_large', m.imports_error_too_large());
	}

	const name = file.name.toLowerCase();
	const buffer = Buffer.from(await file.arrayBuffer());

	if (name.endsWith('.md') || name.endsWith('.markdown')) {
		return parseMarkdownTable(buffer.toString('utf8'));
	}
	if (name.endsWith('.xlsx')) {
		try {
			const data = await readSheet(buffer);
			return fromSheetData(data as unknown[][]);
		} catch (error) {
			if (error instanceof AppError) throw error;
			throw new InvalidInputError('unreadable', m.imports_error_unreadable(), { cause: error });
		}
	}

	throw new InvalidInputError('file_unsupported', m.imports_error_unsupported());
}
