/**
 * Employee import from HR's reconciled workbook (plans/2026-11-08-production-employee-import.md):
 * sheet `Employees` → departments, teams, job titles, staff, team memberships and audit rows, in
 * one transaction.
 *
 *   pnpm exec tsx --env-file=.env scripts/import-employees.ts \
 *     --file ~/secure/syravia/imports/2026-11-08/ready_to_import.xlsx \
 *     --database attendance_app \
 *     --report ~/secure/syravia/imports/2026-11-08/report-dry-run.csv \
 *     [--commit]
 *
 * Without `--commit` it is a dry run: every write runs and is rolled back (EI2). It refuses a DB
 * whose name is not `--database`, a file or report inside this repo, and a sheet whose headers
 * differ. Re-running updates by employee number and never duplicates (EI3). The console prints
 * counts only; the row-level report (mode 600) belongs in `~/secure/syravia/` (CLAUDE.md §1).
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { today } from '@internationalized/date';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { readSheet } from 'read-excel-file/node';
import {
	parseEmployeeSheet,
	planImport,
	type Cell,
	type ImportPlan,
	type Issue
} from '../src/lib/workforce/employee-seed.js';
import { EMPLOYEE_IMPORT_ARABIC } from '../src/lib/workforce/employee-seed-names.js';
import { connect, fail, schema } from './lib.js';

const SHEET = 'Employees';
const REASON = 'Employee import 2026-11-08';
/** The airport time zone (`AIRPORT_TIME_ZONE`); not imported from `#lib/utils` to keep paraglide out. */
const TIME_ZONE = 'Asia/Damascus';
const CHUNK = 100;

const { values: args } = parseArgs({
	options: {
		file: { type: 'string' },
		database: { type: 'string' },
		report: { type: 'string' },
		commit: { type: 'boolean', default: false }
	}
});

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function expandHome(value: string): string {
	return value === '~' || value.startsWith('~/') ? path.join(homedir(), value.slice(1)) : value;
}

/** Real path of a file (or, when it does not exist yet, of its folder); never inside the repo. */
function outsideRepo(value: string, label: string): string {
	const target = path.resolve(expandHome(value));
	const real = existsSync(target)
		? realpathSync(target)
		: path.join(realpathSync(path.dirname(target)), path.basename(target));
	const repo = realpathSync(REPO);
	if (real === repo || real.startsWith(repo + path.sep))
		fail(`Refusing ${label} inside the repo (real data stays in ~/secure/syravia/).`);
	return real;
}

if (!args.file) fail('--file <ready_to_import.xlsx> is required.');
if (!args.database) fail('--database <name> is required (it must equal the connected DB).');
const file = outsideRepo(args.file, '--file');
if (!existsSync(file)) fail('--file does not exist.');
const reportPath = args.report ? outsideRepo(args.report, '--report') : null;

class DryRun extends Error {}

const csv = (value: unknown) => {
	const text = value == null ? '' : String(value);
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function writeReport(plan: ImportPlan | null, issues: Issue[]) {
	if (!reportPath) return;
	const lines = [
		['section', 'row_no', 'employee_no', 'action', 'severity', 'code', 'field', 'name']
	];
	for (const issue of issues)
		lines.push([
			'issue',
			String(issue.rowNo),
			issue.employeeNo ?? '',
			'',
			issue.severity,
			issue.code,
			issue.field ?? '',
			''
		]);
	if (plan) {
		for (const lookup of plan.lookups)
			lines.push(['lookup', '', '', lookup.action, '', lookup.kind, '', lookup.nameEn]);
		for (const create of plan.creates)
			lines.push([
				'staff',
				String(create.rowNo),
				create.values.employeeNo,
				create.active ? 'create' : 'create_inactive',
				'',
				'',
				'',
				''
			]);
		for (const update of plan.updates)
			lines.push([
				'staff',
				String(update.rowNo),
				'',
				'update',
				'',
				'',
				Object.keys(update.after).join(' '),
				update.id
			]);
		for (const same of plan.unchanged)
			lines.push(['staff', String(same.rowNo), '', 'unchanged', '', '', '', same.id]);
	}
	writeFileSync(reportPath, lines.map((line) => line.map(csv).join(',')).join('\n') + '\n', {
		mode: 0o600
	});
	chmodSync(reportPath, 0o600);
}

function countBy<T>(items: readonly T[], key: (item: T) => string): string {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	return [...counts].map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
}

const db = connect();
try {
	const [{ name: database }] = (await db.execute<{ name: string }>(
		sql`select current_database() as name`
	)) as unknown as { name: string }[];
	if (database !== args.database)
		fail(`Connected to "${database}", but --database says "${args.database}". Nothing done.`);

	const admin = await db.query.user.findFirst({
		where: eq(schema.user.active, true),
		columns: { id: true }
	});
	if (!admin) fail('No active user: create the admin first.');
	const actor = admin.id;

	const sheet = (await readSheet(file, SHEET)) as unknown as Cell[][];
	const parsed = parseEmployeeSheet(sheet, today(TIME_ZONE).toString());
	const errors = parsed.issues.filter((issue) => issue.severity === 'error');
	console.log(`file: ${parsed.rows.length} rows parsed, ${errors.length} blocking errors`);
	if (errors.length) {
		writeReport(null, parsed.issues);
		console.log(`errors: ${countBy(errors, (i) => i.code)}`);
		fail('Blocking errors: nothing written. See the report for row numbers.');
	}

	const [departments, teams, jobTitles, staff] = await Promise.all([
		db
			.select({
				id: schema.department.id,
				nameEn: schema.department.nameEn,
				parentId: schema.department.parentId,
				active: schema.department.active
			})
			.from(schema.department),
		db
			.select({ id: schema.team.id, nameEn: schema.team.nameEn, active: schema.team.active })
			.from(schema.team),
		db
			.select({
				id: schema.jobTitle.id,
				nameEn: schema.jobTitle.nameEn,
				active: schema.jobTitle.active
			})
			.from(schema.jobTitle),
		db
			.select({
				id: schema.staff.id,
				employeeNo: schema.staff.employeeNo,
				legacyBadgeNo: schema.staff.legacyBadgeNo,
				fullName: schema.staff.fullName,
				fullNameAr: schema.staff.fullNameAr,
				departmentId: schema.staff.departmentId,
				teamId: schema.staff.teamId,
				jobTitleId: schema.staff.jobTitleId,
				startDate: schema.staff.startDate,
				personalEmail: schema.staff.personalEmail,
				workEmail: schema.staff.workEmail,
				phone: schema.staff.phone
			})
			.from(schema.staff)
	]);

	const plan = planImport(
		parsed.rows,
		{ departments, teams, jobTitles, staff },
		EMPLOYEE_IMPORT_ARABIC,
		randomUUID
	);
	const issues = [...parsed.issues, ...plan.issues];

	const at = new Date();
	const audit = (
		action: string,
		entityType: string,
		entityId: string,
		after: Record<string, unknown>,
		before?: Record<string, unknown>
	) => ({ actorUserId: actor, action, entityType, entityId, before, after, reason: REASON });
	const audits = [
		...plan.departments.map((d) =>
			audit('department.import', 'department', d.id, {
				nameEn: d.nameEn,
				nameAr: d.nameAr,
				parentId: d.parentId
			})
		),
		...plan.teams.map((t) =>
			audit('team.import', 'team', t.id, {
				nameEn: t.nameEn,
				nameAr: t.nameAr,
				departmentId: t.departmentId
			})
		),
		...plan.jobTitles.map((j) =>
			audit('job_title.import', 'job_title', j.id, { nameEn: j.nameEn, nameAr: j.nameAr })
		),
		...plan.creates.map((c) =>
			audit('staff.import', 'staff', c.id, { ...c.values, active: c.active })
		),
		...plan.updates.map((u) => audit('staff.import', 'staff', u.id, u.after, u.before))
	];

	const oldTeam = new Map(staff.map((row) => [row.id, row.teamId]));
	const opened = [
		...plan.creates.filter((c) => c.values.teamId).map((c) => c.id),
		...plan.updates.filter((u) => u.after.teamId).map((u) => u.id)
	].length;
	const closed = plan.updates.filter((u) => u.after.teamId && oldTeam.get(u.id)).length;

	try {
		await db.transaction(async (tx) => {
			const depths = [...new Set(plan.departments.map((d) => d.depth))].sort((a, b) => a - b);
			for (const depth of depths) {
				const level = plan.departments.filter((d) => d.depth === depth);
				await tx
					.insert(schema.department)
					.values(
						level.map((d) => ({
							id: d.id,
							nameEn: d.nameEn,
							nameAr: d.nameAr,
							parentId: d.parentId
						}))
					);
			}
			if (plan.teams.length) await tx.insert(schema.team).values(plan.teams);
			if (plan.jobTitles.length) await tx.insert(schema.jobTitle).values(plan.jobTitles);

			for (let i = 0; i < plan.creates.length; i += CHUNK) {
				const chunk = plan.creates.slice(i, i + CHUNK);
				await tx
					.insert(schema.staff)
					.values(chunk.map((c) => ({ id: c.id, ...c.values, active: c.active })));
				const members = chunk.filter((c) => c.values.teamId);
				if (members.length)
					await tx
						.insert(schema.staffTeamMembership)
						.values(
							members.map((c) => ({ staffId: c.id, teamId: c.values.teamId!, validFrom: at }))
						);
			}

			for (const update of plan.updates) {
				await tx.update(schema.staff).set(update.after).where(eq(schema.staff.id, update.id));
				if (!update.after.teamId) continue;
				// Same as `membershipChange`: close the open membership, open the new one.
				await tx
					.update(schema.staffTeamMembership)
					.set({ validTo: at })
					.where(
						and(
							eq(schema.staffTeamMembership.staffId, update.id),
							isNull(schema.staffTeamMembership.validTo)
						)
					);
				await tx
					.insert(schema.staffTeamMembership)
					.values({ staffId: update.id, teamId: update.after.teamId, validFrom: at });
			}

			for (let i = 0; i < audits.length; i += CHUNK)
				await tx.insert(schema.auditLog).values(audits.slice(i, i + CHUNK));

			if (!args.commit) throw new DryRun();
		});
	} catch (error) {
		if (!(error instanceof DryRun)) throw error;
	}

	// Imported people now in a team or department with a pattern assignment (EI10).
	const assigned = (await db.execute<{ team_id: string | null; department_id: string | null }>(
		sql`select team_id, department_id from pattern_assignment
		    where effective_to is null or effective_to > ${today(TIME_ZONE).toString()}`
	)) as unknown as { team_id: string | null; department_id: string | null }[];
	const assignedTeams = new Set(assigned.map((a) => a.team_id).filter(Boolean));
	const assignedDepartments = new Set(assigned.map((a) => a.department_id).filter(Boolean));
	const rostered = plan.creates.filter(
		(c) =>
			(c.values.teamId && assignedTeams.has(c.values.teamId)) ||
			(c.values.departmentId && assignedDepartments.has(c.values.departmentId))
	).length;

	const lookupCount = (kind: string, action: string) =>
		plan.lookups.filter((l) => l.kind === kind && l.action === action).length;
	const warnings = issues.filter((i) => i.severity === 'warning');
	writeReport(plan, issues);

	console.log(`mode: ${args.commit ? 'COMMITTED' : 'dry run (rolled back)'} on ${database}`);
	console.log(
		`departments: ${lookupCount('department', 'create')} created, ${lookupCount('department', 'reuse')} reused`
	);
	console.log(
		`teams: ${lookupCount('team', 'create')} created, ${lookupCount('team', 'reuse')} reused`
	);
	console.log(
		`job titles: ${lookupCount('job_title', 'create')} created, ${lookupCount('job_title', 'reuse')} reused`
	);
	console.log(
		`staff: ${plan.creates.length} created (${plan.creates.filter((c) => c.active).length} active, ` +
			`${plan.creates.filter((c) => !c.active).length} inactive), ${plan.updates.length} updated, ` +
			`${plan.unchanged.length} unchanged`
	);
	console.log(`memberships: ${opened} opened, ${closed} closed`);
	console.log(`audit rows: ${audits.length}`);
	console.log(`imported people in a group with a pattern assignment: ${rostered}`);
	console.log(`warnings: ${countBy(warnings, (i) => i.code)}`);
	if (reportPath) console.log('report written (mode 600).');
} finally {
	await db.close();
}
