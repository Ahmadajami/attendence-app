// HR's reconciled employee workbook → staff, departments, teams and job titles
// (plans/2026-11-08-production-employee-import.md). Pure: no DB, no SvelteKit, no paraglide, so the
// CLI script `scripts/import-employees.ts` and Vitest can both use it. No personal data here.

/** The 22 headers of the `Employees` sheet (EI2: the run stops when they differ). */
export const EXPECTED_HEADERS = [
	'#',
	'ID (All Staff)',
	'Odoo Badge ID',
	'ID Mismatch',
	'Name (English)',
	'الاسم (Arabic)',
	'Odoo Name',
	'Location',
	'Team',
	'Department (Odoo)',
	'Job (Odoo)',
	'Manager (Odoo)',
	'Joining',
	'Weekly (H)',
	'Shift',
	'Email',
	'Work Email (Odoo)',
	'Work Phone (Odoo)',
	'Probation (days)',
	'Probation Till',
	'Source',
	'Match Method'
] as const;

type Header = (typeof EXPECTED_HEADERS)[number];

/** `Source` value of people found in Odoo only: imported as inactive (Q-EI2). */
export const ODOO_ONLY_SOURCE = 'Odoo only';

export type Cell = string | number | boolean | Date | null | undefined;

export type Severity = 'error' | 'warning';

export type IssueCode =
	| 'missing_header'
	| 'unknown_header'
	| 'duplicate_header'
	| 'no_header_row'
	| 'required'
	| 'invalid_employee_no'
	| 'duplicate_employee_no'
	| 'invalid_badge'
	| 'duplicate_badge'
	| 'badge_taken'
	| 'invalid_date'
	| 'future_date'
	| 'invalid_email'
	| 'missing_arabic_name'
	| 'reused_inactive';

export type Issue = {
	/** Sheet row number (1-based, as Excel shows it); 0 for file- or lookup-level issues. */
	rowNo: number;
	severity: Severity;
	code: IssueCode;
	field?: string;
	employeeNo?: string;
};

/** One employee row after parsing; `null` = empty in the file. */
export type EmployeeRow = {
	rowNo: number;
	employeeNo: string;
	badge: string | null;
	fullName: string;
	fullNameAr: string | null;
	/** Department path from root to leaf, e.g. `['Station Damascus', 'Turkish']`. */
	departmentPath: string[] | null;
	team: string | null;
	jobTitle: string | null;
	startDate: string | null;
	personalEmail: string | null;
	workEmail: string | null;
	phone: string | null;
	active: boolean;
};

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function asciiDigits(value: string): string {
	return value.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf));
}

/** Trim, ASCII digits, single spaces. */
export function cleanText(value: string): string {
	return asciiDigits(value).replace(/\s+/g, ' ').trim();
}

/** Comparison key for names: lowercase, no punctuation, single spaces (like `normalizeText`). */
export function nameKey(value: string): string {
	return asciiDigits(value)
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[ـ]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

const pad = (value: number) => String(value).padStart(2, '0');

function isoFromUtc(date: Date): string {
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function cellString(value: Cell): string {
	if (value == null) return '';
	if (value instanceof Date) return isoFromUtc(value);
	return cleanText(String(value));
}

/** `1234-567` → `1234567`; `null` when it is not digits once the dashes and spaces are gone. */
export function normaliseEmployeeNo(value: string): string | null {
	const digits = asciiDigits(value).replace(/[-\s]/g, '');
	return /^[0-9]+$/.test(digits) ? digits : null;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * An Excel date (1900 system: days since 1899-12-30, the fraction is the time of day), a `Date`
 * from the reader (its UTC fields are the wall-clock value, like `parse.ts` `dateCell`) or an ISO
 * string → `yyyy-mm-dd`. `null` for anything else.
 */
export function excelDate(value: Cell): string | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : isoFromUtc(value);
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value < 1) return null;
		return isoFromUtc(new Date(EXCEL_EPOCH_UTC + Math.floor(value) * DAY_MS));
	}
	if (typeof value === 'string') {
		const text = cleanText(value);
		if (/^\d+(\.\d+)?$/.test(text)) return excelDate(Number(text));
		const match = ISO_DATE.exec(text);
		if (!match) return null;
		const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
		return isoFromUtc(date) === match[0] ? match[0] : null;
	}
	return null;
}

/** `Station Damascus / Turkish` → `['Station Damascus', 'Turkish']`; empty → `null`. */
export function splitDepartmentPath(value: string): string[] | null {
	const parts = value
		.split('/')
		.map(cleanText)
		.filter((part) => part !== '');
	return parts.length ? parts : null;
}

/** Same rule as the `staff_personal_email_format` check. */
const EMAIL = /^[^@\s]+@[^@\s]+$/;

export type ParsedSheet = { rows: EmployeeRow[]; issues: Issue[] };

/**
 * Parse the `Employees` sheet (rows of cells, the header row first; empty rows are skipped).
 * Blocking problems are `error` issues; a field that fails a check is left empty with a `warning`.
 * `today` (`yyyy-mm-dd`) is the latest accepted start date.
 */
export function parseEmployeeSheet(
	sheet: readonly (readonly Cell[])[],
	today: string
): ParsedSheet {
	const issues: Issue[] = [];
	const rows: EmployeeRow[] = [];

	const headerIndex = sheet.findIndex((row) => row.some((cell) => cellString(cell) !== ''));
	if (headerIndex < 0) {
		issues.push({ rowNo: 0, severity: 'error', code: 'no_header_row' });
		return { rows, issues };
	}

	const headerCells = sheet[headerIndex].map((cell) => cellString(cell));
	const column = new Map<Header, number>();
	const expected = new Set<string>(EXPECTED_HEADERS);
	headerCells.forEach((header, index) => {
		if (header === '') return;
		if (!expected.has(header)) {
			issues.push({
				rowNo: headerIndex + 1,
				severity: 'error',
				code: 'unknown_header',
				field: header
			});
		} else if (column.has(header as Header)) {
			issues.push({
				rowNo: headerIndex + 1,
				severity: 'error',
				code: 'duplicate_header',
				field: header
			});
		} else {
			column.set(header as Header, index);
		}
	});
	for (const header of EXPECTED_HEADERS) {
		if (!column.has(header))
			issues.push({
				rowNo: headerIndex + 1,
				severity: 'error',
				code: 'missing_header',
				field: header
			});
	}
	if (issues.length) return { rows, issues };

	const raw = (row: readonly Cell[], header: Header): Cell => row[column.get(header)!];
	const text = (row: readonly Cell[], header: Header) => cellString(raw(row, header));
	const orNull = (value: string) => (value === '' ? null : value);

	const seenNumbers = new Set<string>();
	const seenBadges = new Set<string>();

	sheet.slice(headerIndex + 1).forEach((cells, offset) => {
		if (!cells.some((cell) => cellString(cell) !== '')) return;
		const rowNo = headerIndex + offset + 2;
		const issue = (severity: Severity, code: IssueCode, field: string, employeeNo?: string) =>
			issues.push({ rowNo, severity, code, field, employeeNo });

		const idText = text(cells, 'ID (All Staff)');
		const employeeNo = idText ? normaliseEmployeeNo(idText) : null;
		let blocked = false;
		if (!idText) {
			issue('error', 'required', 'ID (All Staff)');
			blocked = true;
		} else if (!employeeNo) {
			issue('error', 'invalid_employee_no', 'ID (All Staff)');
			blocked = true;
		} else if (seenNumbers.has(employeeNo)) {
			issue('error', 'duplicate_employee_no', 'ID (All Staff)', employeeNo);
			blocked = true;
		} else {
			seenNumbers.add(employeeNo);
		}

		const fullName = text(cells, 'Name (English)');
		if (!fullName) {
			issue('error', 'required', 'Name (English)', employeeNo ?? undefined);
			blocked = true;
		}
		if (blocked || !employeeNo) return;

		const badgeText = text(cells, 'Odoo Badge ID');
		let badge: string | null = null;
		if (badgeText) {
			if (!/^[0-9]+$/.test(badgeText))
				issue('warning', 'invalid_badge', 'Odoo Badge ID', employeeNo);
			else if (seenBadges.has(badgeText))
				issue('warning', 'duplicate_badge', 'Odoo Badge ID', employeeNo);
			else {
				badge = badgeText;
				seenBadges.add(badgeText);
			}
		}

		const joining = raw(cells, 'Joining');
		let startDate: string | null = null;
		if (cellString(joining) !== '') {
			startDate = excelDate(joining);
			if (!startDate) issue('warning', 'invalid_date', 'Joining', employeeNo);
			else if (startDate > today) {
				issue('warning', 'future_date', 'Joining', employeeNo);
				startDate = null;
			}
		}

		const email = (header: Header) => {
			const value = text(cells, header).toLowerCase();
			if (!value) return null;
			if (EMAIL.test(value)) return value;
			issue('warning', 'invalid_email', header, employeeNo);
			return null;
		};

		rows.push({
			rowNo,
			employeeNo,
			badge,
			fullName,
			fullNameAr: orNull(text(cells, 'الاسم (Arabic)')),
			departmentPath: splitDepartmentPath(text(cells, 'Department (Odoo)')),
			team: orNull(text(cells, 'Team')),
			jobTitle: orNull(text(cells, 'Job (Odoo)')),
			startDate,
			personalEmail: email('Email'),
			workEmail: email('Work Email (Odoo)'),
			phone: orNull(text(cells, 'Work Phone (Odoo)')),
			active: text(cells, 'Source') !== ODOO_ONLY_SOURCE
		});
	});

	return { rows, issues };
}

// ---------------------------------------------------------------------------------------------
// Planning: what the rows change in the DB.

export type ExistingDepartment = {
	id: string;
	nameEn: string;
	parentId: string | null;
	active: boolean;
};
export type ExistingTeam = { id: string; nameEn: string; active: boolean };
export type ExistingJobTitle = { id: string; nameEn: string; active: boolean };

/** The staff columns the import writes (`active` only on create, EI3). */
export type StaffValues = {
	employeeNo: string;
	legacyBadgeNo: string | null;
	fullName: string;
	fullNameAr: string | null;
	departmentId: string | null;
	teamId: string | null;
	jobTitleId: string | null;
	startDate: string | null;
	personalEmail: string | null;
	workEmail: string | null;
	phone: string | null;
};

export type ExistingStaff = StaffValues & { id: string };

export type Existing = {
	departments: readonly ExistingDepartment[];
	teams: readonly ExistingTeam[];
	jobTitles: readonly ExistingJobTitle[];
	staff: readonly ExistingStaff[];
};

/** Arabic names for the lookups the import creates, keyed by `nameKey(English name)`. */
export type ArabicNames = {
	departments: Readonly<Record<string, string>>;
	teams: Readonly<Record<string, string>>;
	jobTitles: Readonly<Record<string, string>>;
};

export type NewDepartment = {
	id: string;
	nameEn: string;
	nameAr: string;
	parentId: string | null;
	depth: number;
};
export type NewTeam = { id: string; nameEn: string; nameAr: string; departmentId: string | null };
export type NewJobTitle = { id: string; nameEn: string; nameAr: string };

export type LookupNote = {
	kind: 'department' | 'team' | 'job_title';
	nameEn: string;
	action: 'create' | 'reuse';
	id: string;
};

export type StaffCreate = { id: string; rowNo: number; values: StaffValues; active: boolean };
export type StaffUpdate = {
	id: string;
	rowNo: number;
	before: Partial<StaffValues>;
	after: Partial<StaffValues>;
};

export type ImportPlan = {
	departments: NewDepartment[];
	teams: NewTeam[];
	jobTitles: NewJobTitle[];
	lookups: LookupNote[];
	creates: StaffCreate[];
	updates: StaffUpdate[];
	unchanged: { id: string; rowNo: number }[];
	issues: Issue[];
};

const STAFF_FIELDS = [
	'legacyBadgeNo',
	'fullName',
	'fullNameAr',
	'departmentId',
	'teamId',
	'jobTitleId',
	'startDate',
	'personalEmail',
	'workEmail',
	'phone'
] as const satisfies readonly (keyof StaffValues)[];

/** The department most of a team's rows have; `null` on a tie or when none has one (EI7). */
export function majorityDepartment(departmentIds: readonly (string | null)[]): string | null {
	const counts = new Map<string, number>();
	for (const id of departmentIds) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
	let best: string | null = null;
	let bestCount = 0;
	let tie = false;
	for (const [id, count] of counts) {
		if (count > bestCount) {
			best = id;
			bestCount = count;
			tie = false;
		} else if (count === bestCount) {
			tie = true;
		}
	}
	return tie ? null : best;
}

/**
 * Work out every insert and update (EI3, EI7, EI14): lookups are reused by name (departments among
 * their siblings) or created with an Arabic name from `arabic` (the English name plus a warning
 * when none is given). People are matched by employee number: new ones are created, known ones
 * get the non-blank file values that differ (a blank never erases a value, and `active` is never
 * changed on update). A badge held by another person is dropped with a warning.
 */
export function planImport(
	rows: readonly EmployeeRow[],
	existing: Existing,
	arabic: ArabicNames,
	newId: () => string
): ImportPlan {
	const issues: Issue[] = [];
	const lookups: LookupNote[] = [];
	const departments: NewDepartment[] = [];
	const teams: NewTeam[] = [];
	const jobTitles: NewJobTitle[] = [];

	const arabicFor = (
		kind: LookupNote['kind'],
		table: Readonly<Record<string, string>>,
		nameEn: string
	) => {
		const ar = table[nameKey(nameEn)];
		if (ar) return ar;
		issues.push({
			rowNo: 0,
			severity: 'warning',
			code: 'missing_arabic_name',
			field: `${kind}:${nameEn}`
		});
		return nameEn;
	};

	const reused = new Set<string>();
	const noteReuse = (
		kind: LookupNote['kind'],
		row: { id: string; nameEn: string; active: boolean }
	) => {
		if (reused.has(`${kind}:${row.id}`)) return;
		reused.add(`${kind}:${row.id}`);
		lookups.push({ kind, nameEn: row.nameEn, action: 'reuse', id: row.id });
		if (!row.active)
			issues.push({
				rowNo: 0,
				severity: 'warning',
				code: 'reused_inactive',
				field: `${kind}:${row.nameEn}`
			});
	};

	// Departments: walk each path from the root, reusing a sibling with the same name.
	const departmentByKey = new Map<string, string>();
	const departmentKey = (parentId: string | null, name: string) =>
		`${parentId ?? ''}|${nameKey(name)}`;
	for (const row of existing.departments)
		departmentByKey.set(departmentKey(row.parentId, row.nameEn), row.id);
	const existingDepartment = new Map(existing.departments.map((row) => [row.id, row]));

	const resolveDepartment = (path: string[]): string => {
		let parentId: string | null = null;
		path.forEach((name, depth) => {
			const key = departmentKey(parentId, name);
			let id = departmentByKey.get(key);
			if (id) {
				const old = existingDepartment.get(id);
				if (old) noteReuse('department', old);
			} else {
				id = newId();
				departmentByKey.set(key, id);
				departments.push({
					id,
					nameEn: name,
					nameAr: arabicFor('department', arabic.departments, name),
					parentId,
					depth
				});
				lookups.push({ kind: 'department', nameEn: name, action: 'create', id });
			}
			parentId = id;
		});
		return parentId!;
	};

	const departmentOf = new Map<EmployeeRow, string | null>();
	for (const row of rows)
		departmentOf.set(row, row.departmentPath ? resolveDepartment(row.departmentPath) : null);

	// Teams: reuse by name (team names are unique), else create with the members' majority department.
	const existingTeamByKey = new Map(existing.teams.map((row) => [nameKey(row.nameEn), row]));
	const teamIdByKey = new Map<string, string>();
	const teamRows = new Map<string, EmployeeRow[]>();
	for (const row of rows) {
		if (!row.team) continue;
		const key = nameKey(row.team);
		const list = teamRows.get(key) ?? [];
		list.push(row);
		teamRows.set(key, list);
	}
	for (const [key, members] of teamRows) {
		const old = existingTeamByKey.get(key);
		if (old) {
			noteReuse('team', old);
			teamIdByKey.set(key, old.id);
			continue;
		}
		const id = newId();
		const nameEn = members[0].team!;
		teamIdByKey.set(key, id);
		teams.push({
			id,
			nameEn,
			nameAr: arabicFor('team', arabic.teams, nameEn),
			departmentId: majorityDepartment(members.map((member) => departmentOf.get(member) ?? null))
		});
		lookups.push({ kind: 'team', nameEn, action: 'create', id });
	}

	// Job titles: reuse by name, else create.
	const existingJobByKey = new Map(existing.jobTitles.map((row) => [nameKey(row.nameEn), row]));
	const jobIdByKey = new Map<string, string>();
	for (const row of rows) {
		if (!row.jobTitle) continue;
		const key = nameKey(row.jobTitle);
		if (jobIdByKey.has(key)) continue;
		const old = existingJobByKey.get(key);
		if (old) {
			noteReuse('job_title', old);
			jobIdByKey.set(key, old.id);
			continue;
		}
		const id = newId();
		jobIdByKey.set(key, id);
		jobTitles.push({
			id,
			nameEn: row.jobTitle,
			nameAr: arabicFor('job_title', arabic.jobTitles, row.jobTitle)
		});
		lookups.push({ kind: 'job_title', nameEn: row.jobTitle, action: 'create', id });
	}

	// People.
	const staffByNo = new Map(existing.staff.map((row) => [row.employeeNo, row]));
	const badgeOwner = new Map<string, string>();
	for (const row of existing.staff)
		if (row.legacyBadgeNo) badgeOwner.set(row.legacyBadgeNo, row.employeeNo);

	const creates: StaffCreate[] = [];
	const updates: StaffUpdate[] = [];
	const unchanged: { id: string; rowNo: number }[] = [];

	for (const row of rows) {
		let badge = row.badge;
		const owner = badge ? badgeOwner.get(badge) : undefined;
		if (badge && owner !== undefined && owner !== row.employeeNo) {
			issues.push({
				rowNo: row.rowNo,
				severity: 'warning',
				code: 'badge_taken',
				field: 'Odoo Badge ID',
				employeeNo: row.employeeNo
			});
			badge = null;
		}

		const values: StaffValues = {
			employeeNo: row.employeeNo,
			legacyBadgeNo: badge,
			fullName: row.fullName,
			fullNameAr: row.fullNameAr,
			departmentId: departmentOf.get(row) ?? null,
			teamId: row.team ? (teamIdByKey.get(nameKey(row.team)) ?? null) : null,
			jobTitleId: row.jobTitle ? (jobIdByKey.get(nameKey(row.jobTitle)) ?? null) : null,
			startDate: row.startDate,
			personalEmail: row.personalEmail,
			workEmail: row.workEmail,
			phone: row.phone
		};

		const old = staffByNo.get(row.employeeNo);
		if (!old) {
			creates.push({ id: newId(), rowNo: row.rowNo, values, active: row.active });
			continue;
		}

		const before: Partial<StaffValues> = {};
		const after: Partial<StaffValues> = {};
		for (const field of STAFF_FIELDS) {
			const next = values[field];
			if (next === null || next === old[field]) continue;
			Object.assign(before, { [field]: old[field] });
			Object.assign(after, { [field]: next });
		}
		if (Object.keys(after).length) updates.push({ id: old.id, rowNo: row.rowNo, before, after });
		else unchanged.push({ id: old.id, rowNo: row.rowNo });
	}

	departments.sort((a, b) => a.depth - b.depth);
	return { departments, teams, jobTitles, lookups, creates, updates, unchanged, issues };
}
