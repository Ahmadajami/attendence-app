/**
 * Manual-test data (plans/2026-11-03-e2e-operation-seed.md): the made-up Operation team with one
 * pattern per month (September, October, November 2026), its own crew starts per month, and
 * punches and absences for September and October. Made-up people only (CLAUDE.md §1).
 *
 *   pnpm exec tsx --env-file=.env.e2e scripts/seed-e2e-operation.ts --reset
 *
 * Refuses any database whose name does not end in `_e2e`. `--reset` first empties every test-data
 * table, keeping the accounts, roles, settings, lookup lists and the migration history. Without
 * `--reset` it stops if the Operation team is already there. It never writes `day_result`: run
 * "Recompute from 2026-09-01" on /attendance/days afterwards. Prints counts only.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import {
	OPERATION_HOLIDAY,
	OPERATION_MONTHS,
	OPERATION_PEOPLE,
	OPERATION_SLOTS,
	SEED_FROM,
	SEED_TO,
	buildOperationSeed,
	type SeedShiftCode
} from '../src/lib/dev/operation-seed.js';
import type { BatchQuery } from '../src/lib/server/db/batch.js';
import { connect, fail, schema } from './lib.js';

/** Tables `--reset` keeps: accounts, roles, settings and lookup lists. */
const KEEP = new Set([
	'user',
	'session',
	'login_attempt',
	'role',
	'permission',
	'role_permission',
	'app_setting',
	'staff_function',
	'job_title',
	'skill',
	'document_type',
	'custody_item_type'
]);

const REASON = 'E2E seed';
const NAME = 'Operation';
const NAME_AR = 'التشغيل';

/** Production's D8 / N8 (times, colours, names); windows, break and grace keep the defaults. */
const SHIFTS: Record<SeedShiftCode, { nameEn: string; nameAr: string; colour: string }> = {
	D8: { nameEn: 'Day 08', nameAr: 'نهاري 08', colour: '#475569' },
	N8: { nameEn: 'Night 20', nameAr: 'مسائي 20', colour: '#0f766e' }
};

const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

const db = connect();
try {
	const [{ name: database }] = (await db.execute<{ name: string }>(
		sql`select current_database() as name`
	)) as unknown as { name: string }[];
	if (!database.endsWith('_e2e')) fail(`Refusing to seed "${database}": only a *_e2e database.`);

	const admin = await db.query.user.findFirst({
		where: eq(schema.user.active, true),
		columns: { id: true }
	});
	if (!admin) fail('No active user: create the admin first.');
	const actor = admin.id;

	if (values.reset) {
		const tables = (await db.execute<{ t: string }>(
			sql`select tablename as t from pg_tables where schemaname = 'public' order by tablename`
		)) as unknown as { t: string }[];
		const wipe = tables.map((r) => r.t).filter((t) => !KEEP.has(t));
		// No CASCADE: if a kept table referenced one of these, Postgres refuses instead of emptying it.
		// The edit log refuses TRUNCATE (append-only trigger); in a test DB the user asked to wipe,
		// it is switched off for this one transaction only and back on before the commit.
		await db.transaction(async (tx) => {
			await tx.execute(sql`ALTER TABLE attendance_log DISABLE TRIGGER attendance_log_no_truncate`);
			await tx.execute(
				sql.raw(`TRUNCATE ${wipe.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY`)
			);
			await tx.execute(sql`ALTER TABLE attendance_log ENABLE TRIGGER attendance_log_no_truncate`);
		});
		console.log(`reset: emptied ${wipe.length} tables, kept ${KEEP.size}`);
	} else {
		const existing = await db.query.team.findFirst({
			where: eq(schema.team.nameEn, NAME),
			columns: { id: true }
		});
		if (existing) fail('The Operation team is already there. Run with --reset to seed again.');
	}

	const audit = (entityType: string, entityId: string, after: Record<string, unknown>) =>
		db.insert(schema.auditLog).values({
			actorUserId: actor,
			action: 'seed.create',
			entityType,
			entityId,
			after,
			reason: REASON
		});
	const writes: BatchQuery[] = [];

	// Department, team, shifts.
	const departmentId = randomUUID();
	const teamId = randomUUID();
	writes.push(
		db.insert(schema.department).values({ id: departmentId, nameEn: NAME, nameAr: NAME_AR }),
		audit('department', departmentId, { nameEn: NAME }),
		db.insert(schema.team).values({ id: teamId, nameEn: NAME, nameAr: NAME_AR, departmentId }),
		audit('team', teamId, { nameEn: NAME, departmentId })
	);
	const shiftIds = { D8: randomUUID(), N8: randomUUID() } satisfies Record<SeedShiftCode, string>;
	for (const code of ['D8', 'N8'] as const) {
		const start = code === 'D8' ? '08:00' : '20:00';
		const end = code === 'D8' ? '20:00' : '08:00';
		writes.push(
			db.insert(schema.shift).values({
				id: shiftIds[code],
				code,
				...SHIFTS[code],
				startTime: start,
				endTime: end,
				createdBy: actor
			}),
			audit('shift', shiftIds[code], { code, startTime: start, endTime: end })
		);
	}

	// People and their team membership.
	const staffIds = Array.from({ length: OPERATION_PEOPLE }, () => randomUUID());
	staffIds.forEach((id, i) => {
		const n = String(i + 1).padStart(2, '0');
		writes.push(
			db.insert(schema.staff).values({
				id,
				employeeNo: String(2001 + i),
				fullName: `Ops Tester ${n}`,
				fullNameAr: `مختبر تشغيل ${n}`,
				departmentId,
				teamId,
				startDate: '2026-01-01'
			}),
			db.insert(schema.staffTeamMembership).values({
				staffId: id,
				teamId,
				validFrom: new Date('2026-08-01T00:00:00+03:00')
			}),
			audit('staff', id, { employeeNo: String(2001 + i), teamId })
		);
	});

	// One pattern per month, assigned to the team and the department; own crew starts per month.
	let rules = 0;
	for (const month of OPERATION_MONTHS) {
		const patternId = randomUUID();
		const nameEn = `Operation-1/${month.key}/2026`;
		writes.push(
			db.insert(schema.pattern).values({
				id: patternId,
				nameEn,
				nameAr: nameEn,
				type: 'cycle',
				slots: OPERATION_SLOTS.map((s) => (s === null ? null : shiftIds[s])),
				createdBy: actor
			}),
			audit('pattern', patternId, { nameEn, slots: OPERATION_SLOTS.length })
		);
		for (const target of [{ teamId }, { departmentId }]) {
			const id = randomUUID();
			writes.push(
				db.insert(schema.patternAssignment).values({
					id,
					patternId,
					...target,
					anchorDate: month.anchor,
					effectiveFrom: month.from,
					effectiveTo: month.to,
					reason: REASON,
					createdBy: actor
				}),
				audit('pattern_assignment', id, { patternId, ...target, from: month.from, to: month.to })
			);
		}
		month.crewStarts.forEach((crewStart, i) => {
			if (crewStart === null) return;
			const id = randomUUID();
			rules++;
			writes.push(
				db.insert(schema.staffSchedule).values({
					id,
					staffId: staffIds[i],
					crewStart,
					effectiveFrom: month.from,
					effectiveTo: month.to,
					reason: REASON,
					createdBy: actor
				}),
				audit('staff_schedule', id, { staffId: staffIds[i], crewStart, from: month.from })
			);
		});
	}

	// The company holiday one person works.
	const holidayId = randomUUID();
	writes.push(
		db.insert(schema.patternHoliday).values({
			id: holidayId,
			startsOn: OPERATION_HOLIDAY,
			endsOn: OPERATION_HOLIDAY,
			nameEn: 'E2E holiday',
			nameAr: 'عطلة اختبار',
			otEligible: true,
			reason: REASON,
			createdBy: actor
		}),
		audit('pattern_holiday', holidayId, { startsOn: OPERATION_HOLIDAY, otEligible: true })
	);

	// Punches and absences.
	const seed = buildOperationSeed({ now: new Date() });
	const events = seed.pairs.flatMap((p) => {
		const base = {
			staffId: staffIds[p.person],
			shiftDate: p.shiftDate,
			teamId,
			recordedBy: actor,
			source: 'seed' as const,
			reason: p.reason
		};
		const checkIn = { ...base, type: 'check_in' as const, occurredAt: p.checkIn };
		return p.checkOut
			? [checkIn, { ...base, type: 'check_out' as const, occurredAt: p.checkOut }]
			: [checkIn];
	});
	if (events.length > 0) writes.push(db.insert(schema.attendanceEvent).values(events));
	if (seed.absences.length > 0)
		writes.push(
			db.insert(schema.absence).values(
				seed.absences.map((a) => ({
					staffId: staffIds[a.person],
					startsOn: a.startsOn,
					endsOn: a.endsOn,
					type: a.type,
					reason: REASON,
					recordedBy: actor
				}))
			)
		);
	const kinds = Object.fromEntries(
		Object.entries(Object.groupBy(seed.pairs, (p) => p.kind)).map(([k, v]) => [k, v?.length ?? 0])
	);
	const summary = {
		from: SEED_FROM,
		to: SEED_TO,
		people: OPERATION_PEOPLE,
		patterns: OPERATION_MONTHS.length,
		rules,
		pairs: seed.pairs.length,
		events: events.length,
		absences: seed.absences.length,
		noShows: seed.noShows.length,
		kinds
	};
	writes.push(
		db.insert(schema.auditLog).values({
			actorUserId: actor,
			action: 'seed.e2e_operation',
			entityType: 'attendance_event',
			entityId: `${SEED_FROM}..${SEED_TO}`,
			after: summary,
			reason: REASON
		})
	);

	await db.batch(writes);
	console.log('seeded', JSON.stringify(summary));
	console.log('Next: /attendance/days → Recompute from 2026-09-01.');
} finally {
	await db.close();
}
