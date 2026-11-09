/**
 * Backdate the team memberships the employee import opened
 * (plans/2026-11-09-operations-roster-nov-2026.md RO4, Phase 1):
 *
 *   pnpm exec tsx --env-file=.env scripts/backdate-import-memberships.ts \
 *     --from 2026-10-01 --database attendance_app [--apply]
 *
 * A team plan reaches a person only on dates their membership covers at 00:00 (`teamOnDate`), and
 * the import opened every membership at the import instant, so no earlier day is planned. This moves
 * `valid_from` of each imported person's only, open membership to 00:00 Damascus on `--from`, with
 * one `staff_team_membership.backdate` audit row per membership. It refuses the whole run when any
 * imported person has another membership row (a team move), a closed one, or one that starts before
 * `--from` already. A later run with an older date moves the same rows again.
 *
 * Without `--apply` it is a dry run: every write runs and is rolled back. It refuses a DB whose name
 * is not `--database`. The console prints counts only (CLAUDE.md §1). Stored days are not touched:
 * recompute them from the date afterwards (daily page → "Recompute from a date").
 */
import { parseArgs } from 'node:util';
import { eq, inArray, sql } from 'drizzle-orm';
import { planMembershipBackdate, startOfDayIn } from '../src/lib/roster/membership-backdate.js';
import { connect, fail, schema } from './lib.js';

/** The airport time zone (`AIRPORT_TIME_ZONE`); not imported from `#lib/utils` to keep paraglide out. */
const TIME_ZONE = 'Asia/Damascus';
const IMPORT_ACTION = 'staff.import';
const CHUNK = 100;

const { values: args } = parseArgs({
	options: {
		from: { type: 'string' },
		database: { type: 'string' },
		apply: { type: 'boolean', default: false }
	}
});

if (!args.from) fail('--from <YYYY-MM-DD> is required.');
if (!args.database) fail('--database <name> is required (it must equal the connected DB).');
const fromDate = args.from;
const from = startOfDayIn(fromDate, TIME_ZONE) ?? fail(`--from must be a real YYYY-MM-DD date.`);
const reason = `Import memberships from ${fromDate} (RO4)`;

class DryRun extends Error {}

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

	// People the import created and that still exist (EI15 removed the earlier import's rows).
	const imported = await db
		.selectDistinct({ id: schema.staff.id })
		.from(schema.auditLog)
		.innerJoin(schema.staff, sql`${schema.staff.id}::text = ${schema.auditLog.entityId}`)
		.where(eq(schema.auditLog.action, IMPORT_ACTION));
	const importedIds = new Set(imported.map((row) => row.id));

	const rows = await db
		.select({
			id: schema.staffTeamMembership.id,
			staffId: schema.staffTeamMembership.staffId,
			teamId: schema.staffTeamMembership.teamId,
			validFrom: schema.staffTeamMembership.validFrom,
			validTo: schema.staffTeamMembership.validTo
		})
		.from(schema.staffTeamMembership);
	const teamOf = new Map(rows.map((row) => [row.id, row.teamId]));

	const plan = planMembershipBackdate(rows, importedIds, from);
	const notImported = rows.filter((row) => !importedIds.has(row.staffId)).length;

	console.log(`database: ${database}`);
	console.log(`imported people: ${importedIds.size}`);
	console.log(
		`membership rows: ${rows.length} (${notImported} of people not imported, left alone)`
	);
	console.log(
		`to move: ${plan.moves.length}; already at ${fromDate}: ${plan.unchanged}; ` +
			`refused: ${plan.refused.length}; distinct current starts: ${plan.currentStarts}`
	);
	if (plan.refused.length) {
		const byReason = new Map<string, number>();
		for (const r of plan.refused) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
		console.log(`refused by reason: ${[...byReason].map(([k, n]) => `${k} ${n}`).join(', ')}`);
		fail('Refused rows: nothing written. Check those people by record ID before running again.');
	}

	const audits = plan.moves.map((move) => ({
		actorUserId: admin.id,
		action: 'staff_team_membership.backdate',
		entityType: 'staff_team_membership',
		entityId: move.id,
		before: { staffId: move.staffId, teamId: teamOf.get(move.id), validFrom: move.before },
		after: { staffId: move.staffId, teamId: teamOf.get(move.id), validFrom: move.after },
		reason
	}));

	let updated = 0;
	try {
		await db.transaction(async (tx) => {
			for (let i = 0; i < plan.moves.length; i += CHUNK) {
				const ids = plan.moves.slice(i, i + CHUNK).map((move) => move.id);
				const done = await tx
					.update(schema.staffTeamMembership)
					.set({ validFrom: from })
					.where(inArray(schema.staffTeamMembership.id, ids))
					.returning({ id: schema.staffTeamMembership.id });
				updated += done.length;
			}
			for (let i = 0; i < audits.length; i += CHUNK)
				await tx.insert(schema.auditLog).values(audits.slice(i, i + CHUNK));
			if (updated !== plan.moves.length)
				throw new Error(`Updated ${updated} rows, expected ${plan.moves.length}; rolled back.`);
			if (!args.apply) throw new DryRun();
		});
	} catch (error) {
		if (!(error instanceof DryRun)) throw error;
	}

	console.log(`mode: ${args.apply ? 'APPLIED' : 'dry run (rolled back)'}`);
	console.log(`memberships updated: ${updated}; audit rows: ${audits.length}`);
	console.log(`new start: 00:00 ${TIME_ZONE} on ${fromDate} (${from.toISOString()})`);

	if (args.apply) {
		const [{ count }] = (await db.execute<{ count: number }>(
			sql`select count(*)::int as count from staff_team_membership where valid_from = ${from.toISOString()}::timestamptz`
		)) as unknown as { count: number }[];
		console.log(`check: memberships starting ${fromDate} 00:00 ${TIME_ZONE}: ${count}`);
	}
} finally {
	await db.close();
}
