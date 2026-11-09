/**
 * One-time punch history import from the filled Operations sheet
 * (plans/2026-11-09-operations-october-punch-import.md, OI13–OI17):
 *
 *   pnpm exec tsx --env-file=.env scripts/import-october-punches.ts \
 *     --file ~/secure/syravia/imports/punches/2026-10/operations_punches_2026-10.xlsx \
 *     --database attendance_app --team <team id> --from 2026-10-01 --to 2026-10-31 [--commit]
 *
 * Reads sheet `Punches` (Employee No, Date, Check in, Check out; one row per person and date,
 * Damascus `HH:mm`). People in scope are the team's members over `--from`–`--to`; anyone else is
 * rejected. Each row's shift comes from the person's stored day (OI6) and the entry sheet's rules
 * (`#lib/attendance/punch-import`). Events get `source = import` and a team from the stored day.
 *
 * Without `--commit` it is a dry run: every insert runs inside a transaction that is rolled back.
 * With `--commit` the inserts and one audit row go through `batch()`. A rerun inserts nothing new.
 * It refuses a DB whose name is not `--database`, and on `attendance_app` anything but the
 * Operations team's 6 people in October 2026. The console prints counts and record IDs only
 * (CLAUDE.md §1). Stored days are not recomputed: run "Recompute these days" on the daily page for
 * the team and dates afterwards (OI10).
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { readSheet } from 'read-excel-file/node';
import {
	MissingHeaderError,
	planPunchImport,
	readPunchSheet,
	type ExistingEvent,
	type ScopeDay
} from '../src/lib/attendance/punch-import.js';
import { addDays } from '../src/lib/roster/cycle.js';
import type { SheetCell } from '../src/lib/roster/fit-roster.js';
import type { RosterShift } from '../src/lib/roster/shift.js';
import type { BatchQuery } from '../src/lib/server/db/batch.js';
import { connect, fail, schema } from './lib.js';

const SOURCE = 'import' as const;
const SHEET = 'Punches';
const CHUNK = 200;
const REASON = 'October 2026 punch import: not on the planned shift';

/** The only scope allowed on the real-data DB (plan §0). */
const REAL_DB = 'attendance_app';
const OPS_TEAM = '31da93d7-07cf-4ee6-bf02-606158f67fa2';
const OPS_STAFF = [
	'1c5c2c19-10a8-41c2-b879-bd068686ae8a',
	'412d2b7e-e778-405a-b04b-0f165f2efa1c',
	'4e26598d-7a9d-4921-a5cd-6aacfbe9f1a6',
	'8b8d9748-9f19-4c3e-9a14-d23f38abffe4',
	'b2339c1f-a5f7-4821-bfb7-d8772e4f05f1',
	'ec994043-3806-4bf7-9c06-42cdd38c62b8'
];
const OPS_FROM = '2026-10-01';
const OPS_TO = '2026-10-31';

const { values: args } = parseArgs({
	options: {
		file: { type: 'string' },
		database: { type: 'string' },
		team: { type: 'string' },
		from: { type: 'string' },
		to: { type: 'string' },
		commit: { type: 'boolean', default: false }
	}
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!args.file) fail('--file <path to the filled .xlsx> is required.');
if (!args.database) fail('--database <name> is required (it must equal the connected DB).');
if (!args.team) fail('--team <team id> is required.');
if (!args.from || !DATE.test(args.from) || !args.to || !DATE.test(args.to) || args.from > args.to)
	fail('--from and --to must be YYYY-MM-DD dates, from <= to.');
const { from, to, team } = { from: args.from, to: args.to, team: args.team };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expand = (value: string) =>
	value === '~' || value.startsWith('~/') ? path.join(homedir(), value.slice(1)) : value;
const file = path.resolve(expand(args.file));
if (realpathSync(file).startsWith(realpathSync(REPO) + path.sep))
	fail('Refusing a file inside the repo (real data stays in ~/secure/syravia/).');

const short = (id: string) => id.slice(0, 8);
const tally = (items: readonly string[]) => {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
	return [...counts].sort(([a], [b]) => a.localeCompare(b));
};
const line = (label: string, items: readonly string[]) =>
	console.log(
		`${label}: ${
			items.length === 0
				? '0'
				: tally(items)
						.map(([k, n]) => `${k} ${n}`)
						.join(', ')
		}`
	);

class DryRun extends Error {}

const db = connect();
try {
	const [{ name: database }] = (await db.execute<{ name: string }>(
		sql`select current_database() as name`
	)) as unknown as { name: string }[];
	if (database !== args.database)
		fail(`Connected to "${database}", but --database says "${args.database}". Nothing done.`);
	if (database === REAL_DB && (team !== OPS_TEAM || from < OPS_FROM || to > OPS_TO))
		fail(`On ${REAL_DB} only team ${short(OPS_TEAM)} from ${OPS_FROM} to ${OPS_TO}. Nothing done.`);

	const admin = await db.query.user.findFirst({
		where: eq(schema.user.active, true),
		columns: { id: true }
	});
	if (!admin) fail('No active user: create the admin first.');

	// People in scope: members of the team on some date of the range (memberships start at 00:00).
	const rangeStart = new Date(`${from}T00:00:00+03:00`);
	const rangeEnd = new Date(`${addDays(to, 1)}T00:00:00+03:00`);
	const members = await db
		.selectDistinct({ id: schema.staff.id, employeeNo: schema.staff.employeeNo })
		.from(schema.staffTeamMembership)
		.innerJoin(schema.staff, eq(schema.staff.id, schema.staffTeamMembership.staffId))
		.where(
			and(
				eq(schema.staffTeamMembership.teamId, team),
				sql`${schema.staffTeamMembership.validFrom} < ${rangeEnd.toISOString()}::timestamptz`,
				sql`(${schema.staffTeamMembership.validTo} is null or ${schema.staffTeamMembership.validTo} > ${rangeStart.toISOString()}::timestamptz)`
			)
		);
	const staffIds = members.map((m) => m.id);
	if (staffIds.length === 0) fail(`Team ${short(team)} has nobody in ${from}–${to}. Nothing done.`);
	if (
		database === REAL_DB &&
		(staffIds.length !== OPS_STAFF.length || !OPS_STAFF.every((id) => staffIds.includes(id)))
	)
		fail(`Team ${short(team)} no longer has exactly the 6 planned people. Nothing done.`);
	const people = new Map(members.map((m) => [m.employeeNo, m.id]));

	const shiftRows = await db.select().from(schema.shift);
	const toShift = (s: (typeof shiftRows)[number]): RosterShift => ({
		id: s.id,
		code: s.code,
		nameEn: s.nameEn,
		nameAr: s.nameAr,
		colour: s.colour,
		startTime: s.startTime,
		endTime: s.endTime,
		breakMinutes: s.breakMinutes,
		requiredMinutes: s.requiredMinutes,
		windowBeforeMinutes: s.windowBeforeMinutes,
		windowAfterMinutes: s.windowAfterMinutes,
		graceMinutes: s.graceMinutes,
		active: s.active
	});
	const shiftById = new Map(shiftRows.map((s) => [s.id, toShift(s)]));

	const stored = await db
		.select({
			staffId: schema.dayResult.staffId,
			date: schema.dayResult.shiftDate,
			teamId: schema.dayResult.teamId,
			shiftId: schema.dayResult.shiftId,
			source: schema.dayResult.source,
			swapRole: schema.dayResult.swapRole
		})
		.from(schema.dayResult)
		.where(
			and(
				inArray(schema.dayResult.staffId, staffIds),
				gte(schema.dayResult.shiftDate, from),
				lte(schema.dayResult.shiftDate, to)
			)
		);
	const days = new Map<string, ScopeDay>(
		stored.map((d) => [
			`${d.staffId} ${d.date}`,
			{
				staffId: d.staffId,
				date: d.date,
				teamId: d.teamId,
				shift: d.shiftId ? (shiftById.get(d.shiftId) ?? null) : null,
				source: d.source,
				swapRole: d.swapRole
			}
		])
	);

	// Candidates: active shifts, the ones these people's days use first (a tie goes to them).
	const used = new Map<string, number>();
	for (const d of stored) if (d.shiftId) used.set(d.shiftId, (used.get(d.shiftId) ?? 0) + 1);
	const shifts = [...shiftById.values()]
		.filter((s) => s.active)
		.sort((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0) || a.code.localeCompare(b.code));

	const existing: ExistingEvent[] = await db
		.select({
			id: schema.attendanceEvent.id,
			staffId: schema.attendanceEvent.staffId,
			type: schema.attendanceEvent.type,
			occurredAt: schema.attendanceEvent.occurredAt,
			correctsEventId: schema.attendanceEvent.correctsEventId,
			isVoid: schema.attendanceEvent.isVoid,
			source: schema.attendanceEvent.source
		})
		.from(schema.attendanceEvent)
		.where(
			and(
				inArray(schema.attendanceEvent.staffId, staffIds),
				gte(schema.attendanceEvent.shiftDate, addDays(from, -2)),
				lte(schema.attendanceEvent.shiftDate, addDays(to, 2))
			)
		);

	let sheet: ReturnType<typeof readPunchSheet>;
	try {
		sheet = readPunchSheet((await readSheet(file, SHEET)) as unknown as SheetCell[][]);
	} catch (error) {
		if (error instanceof MissingHeaderError) fail(`${error.message} Nothing done.`);
		throw error;
	}

	const plan = planPunchImport({
		rows: sheet.rows,
		people,
		days,
		shifts,
		existing,
		from,
		to,
		now: new Date(),
		reason: REASON,
		source: SOURCE
	});
	const events = plan.pairs.flatMap((p) => p.events);
	const code = (id: string) => shiftById.get(id)?.code ?? short(id);

	console.log(`database: ${database}; team ${short(team)}; ${from} → ${to}; source ${SOURCE}`);
	console.log(`file: ${path.basename(file)}, sheet ${SHEET}`);
	console.log(
		`people in scope: ${staffIds.length}; matched in the file: ${new Set(sheet.rows.map((r) => people.get(r.employeeNo)).filter(Boolean)).size}`
	);
	console.log(`rows with times: ${sheet.rows.length}; rows without times: ${sheet.empty}`);
	line(
		'unreadable rows by issue',
		sheet.issues.map((i) => i.issue)
	);
	line(
		'rejected rows by reason',
		plan.rejected.map((r) => r.reason)
	);
	console.log(
		`already imported (skipped): ${plan.alreadyImported}; duplicates within 60 s (skipped): ${plan.duplicates}`
	);
	console.log(`pairs to import: ${plan.pairs.length}; events to insert: ${events.length}`);
	line(
		'pairs per person',
		plan.pairs.map((p) => short(p.staffId))
	);
	line(
		'events per person',
		events.map((e) => short(e.staffId))
	);
	line(
		'pairs per shift date',
		plan.pairs.map((p) => p.shiftDate)
	);
	line(
		'pairs per shift',
		plan.pairs.map((p) => code(p.shiftId))
	);
	line(
		'pairs not on the planned shift (person date shift)',
		plan.pairs
			.filter((p) => !p.planned)
			.map((p) => `${short(p.staffId)} ${p.shiftDate} ${code(p.shiftId)}`)
	);
	line(
		'warnings',
		plan.pairs.flatMap((p) => p.warnings)
	);
	line(
		'open pairs (no check-out)',
		plan.pairs
			.filter((p) => !p.events.some((e) => e.type === 'check_out'))
			.map((p) => short(p.staffId))
	);

	const rejectedBy = Object.fromEntries(tally(plan.rejected.map((r) => r.reason)));
	const queries: BatchQuery[] = [];
	for (let i = 0; i < events.length; i += CHUNK)
		queries.push(
			db.insert(schema.attendanceEvent).values(
				events.slice(i, i + CHUNK).map((e) => ({
					staffId: e.staffId,
					type: e.type,
					occurredAt: e.occurredAt,
					shiftDate: e.shiftDate,
					shiftId: e.shiftId,
					teamId: e.teamId,
					recordedBy: admin.id,
					source: SOURCE,
					reason: e.reason
				}))
			)
		);
	if (events.length > 0)
		queries.push(
			db.insert(schema.auditLog).values({
				actorUserId: admin.id,
				action: 'attendance_event.import',
				entityType: 'attendance_event',
				entityId: path.basename(file),
				before: null,
				after: {
					file: path.basename(file),
					database,
					teamId: team,
					from,
					to,
					source: SOURCE,
					people: new Set(events.map((e) => e.staffId)).size,
					pairs: plan.pairs.length,
					events: events.length,
					unplanned: plan.pairs.filter((p) => !p.planned).length,
					rejected: rejectedBy,
					alreadyImported: plan.alreadyImported,
					duplicates: plan.duplicates
				},
				reason: 'One-time punch history import (plan 2026-11-09-operations-october-punch-import)'
			})
		);

	if (queries.length === 0) console.log('mode: nothing to insert');
	else if (args.commit) {
		await db.batch(queries);
		console.log(`mode: COMMITTED; events inserted: ${events.length}; audit rows: 1`);
	} else {
		try {
			await db.transaction(async (tx) => {
				for (const query of queries) await tx.execute(query.getSQL());
				throw new DryRun();
			});
		} catch (error) {
			if (!(error instanceof DryRun)) throw error;
		}
		console.log(`mode: dry run (inserts ran and were rolled back); events: ${events.length}`);
	}
} finally {
	await db.close();
}
