import { describe, expect, it } from 'vitest';
import {
	EXPECTED_HEADERS,
	excelDate,
	majorityDepartment,
	nameKey,
	normaliseEmployeeNo,
	parseEmployeeSheet,
	planImport,
	splitDepartmentPath,
	type ArabicNames,
	type Cell,
	type Existing,
	type ExistingStaff
} from './employee-seed.js';
import { EMPLOYEE_IMPORT_ARABIC } from './employee-seed-names.js';

// Made-up people, numbers and e-mail addresses only (CLAUDE.md §1).
type RowInput = Partial<Record<(typeof EXPECTED_HEADERS)[number], Cell>>;

const row = (values: RowInput): Cell[] => EXPECTED_HEADERS.map((header) => values[header] ?? null);
const sheet = (...rows: RowInput[]): Cell[][] => [[...EXPECTED_HEADERS], ...rows.map(row)];
const TODAY = '2026-11-08';

const person = (n: number, extra: RowInput = {}): RowInput => ({
	'#': n,
	'ID (All Staff)': `9000-${String(n).padStart(3, '0')}`,
	'Odoo Badge ID': `9000${String(n).padStart(3, '0')}`,
	'Name (English)': `Import Tester ${n}`,
	'الاسم (Arabic)': `مختبر استيراد ${n}`,
	Source: 'Both',
	...extra
});

const noArabic: ArabicNames = { departments: {}, teams: {}, jobTitles: {} };
const emptyDb: Existing = { departments: [], teams: [], jobTitles: [], staff: [] };

function ids() {
	let n = 0;
	return () => `id-${++n}`;
}

describe('normaliseEmployeeNo', () => {
	it('removes dashes and spaces and converts Arabic-Indic digits', () => {
		expect(normaliseEmployeeNo('9000-001')).toBe('9000001');
		expect(normaliseEmployeeNo(' ٩٠٠٠-٠٠٢ ')).toBe('9000002');
		expect(normaliseEmployeeNo('900')).toBe('900');
	});
	it('refuses anything that is not digits', () => {
		expect(normaliseEmployeeNo('AB-12')).toBeNull();
		expect(normaliseEmployeeNo('-')).toBeNull();
	});
});

describe('excelDate', () => {
	it('reads Excel serials, Date cells and ISO strings', () => {
		expect(excelDate(45658)).toBe('2025-01-01');
		expect(excelDate(45658.75)).toBe('2025-01-01');
		expect(excelDate('45658')).toBe('2025-01-01');
		expect(excelDate(new Date(Date.UTC(2024, 1, 29)))).toBe('2024-02-29');
		expect(excelDate('2024-02-29')).toBe('2024-02-29');
	});
	it('returns null for empty or invalid values', () => {
		expect(excelDate(null)).toBeNull();
		expect(excelDate('')).toBeNull();
		expect(excelDate('soon')).toBeNull();
		expect(excelDate('2025-02-30')).toBeNull();
		expect(excelDate(0)).toBeNull();
	});
});

describe('splitDepartmentPath', () => {
	it('splits one and two levels', () => {
		expect(splitDepartmentPath('Test Station')).toEqual(['Test Station']);
		expect(splitDepartmentPath(' Test Station /  Crew A ')).toEqual(['Test Station', 'Crew A']);
		expect(splitDepartmentPath('')).toBeNull();
	});
});

describe('majorityDepartment', () => {
	it('picks the most common department, none on a tie', () => {
		expect(majorityDepartment(['a', 'b', 'a', null])).toBe('a');
		expect(majorityDepartment(['a', 'b'])).toBeNull();
		expect(majorityDepartment([null, null])).toBeNull();
	});
});

describe('parseEmployeeSheet', () => {
	it('parses a full row', () => {
		const { rows, issues } = parseEmployeeSheet(
			sheet(
				person(1, {
					'Department (Odoo)': 'Test Station / Crew A',
					Team: 'Crew A Team',
					'Job (Odoo)': 'Test Agent',
					Joining: 45658,
					Email: 'Tester1@Example.test',
					'Work Email (Odoo)': 'tester1@work.example.test',
					'Work Phone (Odoo)': '+000 000 000 001'
				})
			),
			TODAY
		);
		expect(issues).toEqual([]);
		expect(rows).toEqual([
			{
				rowNo: 2,
				employeeNo: '9000001',
				badge: '9000001',
				fullName: 'Import Tester 1',
				fullNameAr: 'مختبر استيراد 1',
				departmentPath: ['Test Station', 'Crew A'],
				team: 'Crew A Team',
				jobTitle: 'Test Agent',
				startDate: '2025-01-01',
				personalEmail: 'tester1@example.test',
				workEmail: 'tester1@work.example.test',
				phone: '+000 000 000 001',
				active: true
			}
		]);
	});

	it('skips empty rows and keeps Excel row numbers', () => {
		const { rows } = parseEmployeeSheet([...sheet(person(1)), [], row({}), row(person(2))], TODAY);
		expect(rows.map((r) => [r.rowNo, r.employeeNo])).toEqual([
			[2, '9000001'],
			[5, '9000002']
		]);
	});

	it('blocks a missing, invalid or duplicate ID and a missing name', () => {
		const { rows, issues } = parseEmployeeSheet(
			sheet(
				person(1),
				person(2, { 'ID (All Staff)': '' }),
				person(3, { 'ID (All Staff)': 'X-1' }),
				person(4, { 'ID (All Staff)': '9000001' }),
				person(5, { 'Name (English)': ' ' })
			),
			TODAY
		);
		expect(rows.map((r) => r.employeeNo)).toEqual(['9000001']);
		expect(issues.map((i) => [i.rowNo, i.severity, i.code])).toEqual([
			[3, 'error', 'required'],
			[4, 'error', 'invalid_employee_no'],
			[5, 'error', 'duplicate_employee_no'],
			[6, 'error', 'required']
		]);
	});

	it('warns and leaves the field empty for a bad email, date or badge', () => {
		const { rows, issues } = parseEmployeeSheet(
			sheet(
				person(1, { Email: 'not-an-email', Joining: 'soon' }),
				person(2, { Joining: '2027-01-01', 'Odoo Badge ID': '9000001' }),
				person(3, { 'Odoo Badge ID': 'B-3' })
			),
			TODAY
		);
		expect(rows.map((r) => [r.personalEmail, r.startDate, r.badge])).toEqual([
			[null, null, '9000001'],
			[null, null, null],
			[null, null, null]
		]);
		expect(issues.map((i) => [i.rowNo, i.severity, i.code])).toEqual([
			[2, 'warning', 'invalid_date'],
			[2, 'warning', 'invalid_email'],
			[3, 'warning', 'duplicate_badge'],
			[3, 'warning', 'future_date'],
			[4, 'warning', 'invalid_badge']
		]);
	});

	it('marks Odoo-only people inactive', () => {
		const { rows } = parseEmployeeSheet(
			sheet(person(1, { Source: 'Odoo only' }), person(2)),
			TODAY
		);
		expect(rows.map((r) => r.active)).toEqual([false, true]);
	});

	it('refuses a sheet whose headers differ', () => {
		const headers = [...EXPECTED_HEADERS.filter((h) => h !== 'Team'), 'Extra'];
		const { rows, issues } = parseEmployeeSheet([headers, ['1']], TODAY);
		expect(rows).toEqual([]);
		expect(issues.map((i) => [i.code, i.field])).toEqual([
			['unknown_header', 'Extra'],
			['missing_header', 'Team']
		]);
	});
});

describe('planImport', () => {
	const parse = (...rows: RowInput[]) => parseEmployeeSheet(sheet(...rows), TODAY).rows;

	it('creates the department tree, teams and job titles once each', () => {
		const rows = parse(
			person(1, {
				'Department (Odoo)': 'Test Station / Crew A',
				Team: 'Alpha',
				'Job (Odoo)': 'Agent'
			}),
			person(2, {
				'Department (Odoo)': 'Test Station / Crew A',
				Team: 'alpha',
				'Job (Odoo)': 'agent'
			}),
			person(3, { 'Department (Odoo)': 'Test Station / Crew B', Team: 'Alpha' }),
			person(4, { 'Department (Odoo)': 'Test Station' })
		);
		const plan = planImport(rows, emptyDb, noArabic, ids());
		expect(plan.departments.map((d) => [d.nameEn, d.depth])).toEqual([
			['Test Station', 0],
			['Crew A', 1],
			['Crew B', 1]
		]);
		const [station, crewA] = plan.departments;
		expect(plan.departments[1].parentId).toBe(station.id);
		expect(plan.teams).toEqual([
			{ id: expect.any(String), nameEn: 'Alpha', nameAr: 'Alpha', departmentId: crewA.id }
		]);
		expect(plan.jobTitles.map((j) => j.nameEn)).toEqual(['Agent']);
		expect(plan.creates.map((c) => c.values.departmentId)).toEqual([
			crewA.id,
			crewA.id,
			plan.departments[2].id,
			station.id
		]);
		expect(plan.creates.every((c) => c.values.teamId === plan.teams[0].id || c.rowNo === 5)).toBe(
			true
		);
		// No Arabic names given: English fallback plus one warning per created lookup.
		expect(plan.issues.filter((i) => i.code === 'missing_arabic_name')).toHaveLength(5);
	});

	it('gives a new team no department on a tie', () => {
		const rows = parse(
			person(1, { 'Department (Odoo)': 'One', Team: 'Mixed' }),
			person(2, { 'Department (Odoo)': 'Two', Team: 'Mixed' })
		);
		expect(planImport(rows, emptyDb, noArabic, ids()).teams[0].departmentId).toBeNull();
	});

	it('reuses existing lookups by name, without aliases onto near-matches', () => {
		const existing: Existing = {
			departments: [{ id: 'dep-ops', nameEn: 'Operation', parentId: null, active: true }],
			teams: [{ id: 'team-hr', nameEn: 'HR', active: false }],
			jobTitles: [{ id: 'job-agent', nameEn: 'Agent', active: true }],
			staff: []
		};
		const rows = parse(
			person(1, { 'Department (Odoo)': 'Operations', Team: 'hr', 'Job (Odoo)': 'AGENT' })
		);
		const plan = planImport(rows, existing, noArabic, ids());
		expect(plan.departments.map((d) => d.nameEn)).toEqual(['Operations']);
		expect(plan.teams).toEqual([]);
		expect(plan.jobTitles).toEqual([]);
		expect(plan.creates[0].values).toMatchObject({ teamId: 'team-hr', jobTitleId: 'job-agent' });
		expect(plan.lookups.filter((l) => l.action === 'reuse').map((l) => l.kind)).toEqual([
			'team',
			'job_title'
		]);
		expect(plan.issues.map((i) => i.code)).toContain('reused_inactive');
	});

	it('uses the Arabic names table', () => {
		const rows = parse(
			person(1, { 'Department (Odoo)': 'Station Damascus / Turkish', Team: 'HR' })
		);
		const plan = planImport(rows, emptyDb, EMPLOYEE_IMPORT_ARABIC, ids());
		expect(plan.departments.map((d) => d.nameAr)).toEqual(['محطة دمشق', 'التركية']);
		expect(plan.teams[0].nameAr).toBe('الموارد البشرية');
		expect(plan.issues).toEqual([]);
	});

	it('updates only changed non-blank fields and never touches active', () => {
		const old: ExistingStaff = {
			id: 'staff-1',
			employeeNo: '9000001',
			legacyBadgeNo: '9000001',
			fullName: 'Import Tester 1',
			fullNameAr: 'مختبر استيراد 1',
			departmentId: null,
			teamId: null,
			jobTitleId: null,
			startDate: '2020-01-01',
			personalEmail: 'old@example.test',
			workEmail: null,
			phone: null
		};
		const rows = parse(person(1, { Email: 'new@example.test', Source: 'Odoo only' }), person(2));
		const plan = planImport(rows, { ...emptyDb, staff: [old] }, noArabic, ids());
		expect(plan.updates).toEqual([
			{
				id: 'staff-1',
				rowNo: 2,
				before: { personalEmail: 'old@example.test' },
				after: { personalEmail: 'new@example.test' }
			}
		]);
		expect(plan.creates.map((c) => c.values.employeeNo)).toEqual(['9000002']);
	});

	it('drops a badge another person already holds', () => {
		const other: ExistingStaff = {
			id: 'staff-9',
			employeeNo: '1234',
			legacyBadgeNo: '9000001',
			fullName: 'Someone Else',
			fullNameAr: null,
			departmentId: null,
			teamId: null,
			jobTitleId: null,
			startDate: null,
			personalEmail: null,
			workEmail: null,
			phone: null
		};
		const plan = planImport(parse(person(1)), { ...emptyDb, staff: [other] }, noArabic, ids());
		expect(plan.creates[0].values.legacyBadgeNo).toBeNull();
		expect(plan.issues.map((i) => i.code)).toEqual(['badge_taken']);
	});

	it('changes nothing when run again over its own result', () => {
		const rows = parse(
			person(1, {
				'Department (Odoo)': 'Test Station / Crew A',
				Team: 'Alpha',
				'Job (Odoo)': 'Agent',
				Joining: 45658
			}),
			person(2, { Team: 'Beta', Email: 'two@example.test' })
		);
		const first = planImport(rows, emptyDb, noArabic, ids());
		const after: Existing = {
			departments: first.departments.map((d) => ({
				id: d.id,
				nameEn: d.nameEn,
				parentId: d.parentId,
				active: true
			})),
			teams: first.teams.map((t) => ({ id: t.id, nameEn: t.nameEn, active: true })),
			jobTitles: first.jobTitles.map((j) => ({ id: j.id, nameEn: j.nameEn, active: true })),
			staff: first.creates.map((c) => ({ id: c.id, ...c.values }))
		};
		const second = planImport(rows, after, noArabic, ids());
		expect(second.creates).toEqual([]);
		expect(second.updates).toEqual([]);
		expect(second.departments).toEqual([]);
		expect(second.teams).toEqual([]);
		expect(second.jobTitles).toEqual([]);
		expect(second.unchanged).toHaveLength(2);
	});

	it('keys names case- and punctuation-insensitively', () => {
		expect(nameKey('Turkish & AJET(A)')).toBe(nameKey('turkish  ajet (a)'));
	});
});
