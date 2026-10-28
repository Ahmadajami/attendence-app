import { asc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { staff, staffFunction, team } from '#lib/server/db/schema/index.js';
import type { StaffImportData, ImportIssue, ImportRowDraft } from '#lib/types/imports.js';
import { normalizeText, mapColumns, STAFF_COLUMNS, type StaffField } from './columns.js';
import type { RawTable } from './parse.js';

type Lookup = { id: string; key?: string; nameEn: string; nameAr: string };

function lookupByName(rows: Lookup[]) {
	const map = new Map<string, Lookup>();
	for (const row of rows) {
		for (const value of [row.key, row.nameEn, row.nameAr]) {
			if (!value) continue;
			const key = normalizeText(value);
			if (key && !map.has(key)) map.set(key, row);
		}
	}
	return map;
}

function get(row: { values: string[] }, columns: Map<StaffField, number>, field: StaffField) {
	const index = columns.get(field);
	return index === undefined ? '' : (row.values[index] ?? '').trim();
}

export async function buildStaffRows(table: RawTable): Promise<ImportRowDraft[]> {
	const columns = mapColumns(table.headers, STAFF_COLUMNS);
	const [functions, teams, existingStaff] = await Promise.all([
		db
			.select({
				id: staffFunction.id,
				key: staffFunction.key,
				nameEn: staffFunction.nameEn,
				nameAr: staffFunction.nameAr
			})
			.from(staffFunction)
			.orderBy(asc(staffFunction.nameEn)),
		db
			.select({ id: team.id, nameEn: team.nameEn, nameAr: team.nameAr, active: team.active })
			.from(team)
			.orderBy(asc(team.nameEn)),
		db
			.select({
				id: staff.id,
				employeeNo: staff.employeeNo,
				fullName: staff.fullName,
				fullNameAr: staff.fullNameAr,
				phone: staff.phone,
				functionId: staff.functionId,
				teamId: staff.teamId
			})
			.from(staff)
	]);

	const functionByName = lookupByName(functions);
	const teamByName = lookupByName(teams.filter((row) => row.active));
	const staffByNumber = new Map(existingStaff.map((row) => [row.employeeNo, row]));
	const seenNumbers = new Set<string>();

	return table.rows.map((row) => {
		const issues: ImportIssue[] = [];

		const employeeNo = get(row, columns, 'employee_no');
		const fullName = get(row, columns, 'full_name');
		const fullNameAr = get(row, columns, 'full_name_ar');
		const phone = get(row, columns, 'phone');
		const functionName = get(row, columns, 'function');
		const teamName = get(row, columns, 'team');

		if (!employeeNo) {
			issues.push({ field: 'employee_no', code: 'required' });
		} else if (!/^[0-9]+$/.test(employeeNo)) {
			issues.push({ field: 'employee_no', code: 'invalid_employee_no', value: employeeNo });
		} else if (seenNumbers.has(employeeNo)) {
			issues.push({ field: 'employee_no', code: 'duplicate_in_file', value: employeeNo });
		} else {
			seenNumbers.add(employeeNo);
		}

		if (!fullName) issues.push({ field: 'full_name', code: 'required' });

		const fn = functionName ? functionByName.get(normalizeText(functionName)) : undefined;
		if (!functionName) issues.push({ field: 'function', code: 'required' });
		else if (!fn) {
			issues.push({ field: 'function', code: 'unknown_function', value: functionName });
		}

		const teamRow = teamName ? teamByName.get(normalizeText(teamName)) : undefined;
		if (teamName && !teamRow) {
			issues.push({ field: 'team', code: 'unknown_team', value: teamName });
		}

		const existing = employeeNo ? staffByNumber.get(employeeNo) : undefined;
		// A blank team keeps the current team on update; new rows start with no team.
		const teamId = teamRow ? teamRow.id : (existing?.teamId ?? null);

		const parsed: StaffImportData | null =
			employeeNo && fullName && fn
				? {
						employeeNo,
						fullName,
						fullNameAr: fullNameAr || null,
						phone: phone || null,
						functionId: fn.id,
						teamId
					}
				: null;

		let action: 'create' | 'update' | 'skip' = 'skip';
		let targetId: string | null = null;

		if (issues.length === 0 && parsed) {
			if (!existing) {
				action = 'create';
			} else {
				targetId = existing.id;
				const unchanged =
					existing.fullName === parsed.fullName &&
					(existing.fullNameAr ?? null) === parsed.fullNameAr &&
					(existing.phone ?? null) === parsed.phone &&
					existing.functionId === parsed.functionId &&
					(existing.teamId ?? null) === parsed.teamId;
				action = unchanged ? 'skip' : 'update';
			}
		}

		return {
			rowNo: row.rowNo,
			raw: row.raw,
			parsed,
			errors: issues,
			action,
			targetId
		};
	});
}
