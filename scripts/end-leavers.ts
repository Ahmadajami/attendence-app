/**
 * Ends the team membership of leavers on their last day (decision SP17: the 22 stay in attendance
 * except the leavers listed by HR; it replaces the 1 November date of plan item C2).
 *
 *   pnpm exec tsx --env-file=.env scripts/end-leavers.ts \
 *     --file ~/secure/syravia/imports/leavers.csv --database attendance_app [--commit]
 *
 * The file (outside this repo, mode 600) has the header `email,last_day` and one row per leaver,
 * with last_day as yyyy-mm-dd. Each email must match exactly one of the staff rows created on
 * CREATED_ON (the Odoo-only batch) by work or personal email. Without --commit the run is rolled back.
 * With --commit it closes the open team membership at the start of the day after last_day (Asia/Damascus),
 * clears staff.team_id, and writes one audit row per person in the same transaction. The person
 * stays active. The console prints counts and CSV line numbers only: no names, emails or badges.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseDate } from '@internationalized/date';
import postgres from 'postgres';

// The Odoo-only batch: the staff rows created on this day, with no team.
const CREATED_ON = '2026-11-12';
const REASON = 'SP17: leaver, team membership ends the day after the last day';

type Leaver = { email: string; lastDay: string; line: number };
type Candidate = {
	id: string;
	team_id: string | null;
	work_email: string | null;
	personal_email: string | null;
};

class DryRun extends Error {}

function fail(message: string): never {
	console.error(message);
	//this will make the process exit with a non-zero code, indicating failure
	process.exit(1);
}
// Reads the leavers file and validates its contents. Returns an array of Leaver objects.
function readLeavers(text: string): Leaver[] {
	const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
	if (lines[0]?.trim().toLowerCase() !== 'email,last_day')
		fail('The first line must be exactly: email,last_day');
	return lines.slice(1).map((raw, index) => {
		const [email = '', lastDay = ''] = raw.split(',').map((part) => part.trim());
		const line = index + 2;
		if (!/^[^@\s]+@[^@\s]+$/.test(email)) fail(`Line ${line}: the email is not valid.`);
		const valid =
			/^\d{4}-\d{2}-\d{2}$/.test(lastDay) &&
			new Date(`${lastDay}T00:00:00Z`).toISOString().slice(0, 10) === lastDay;
		if (!valid) fail(`Line ${line}: last_day must be a real date as yyyy-mm-dd.`);
		return { email: email.toLowerCase(), lastDay, line };
	});
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			file: { type: 'string' },
			database: { type: 'string' },
			commit: { type: 'boolean', default: false }
		}
	});
	if (!values.file) fail('--file is required.');
	if (!values.database)
		fail('--database is required: the name of the database you intend to change.');

	const repo = realpathSync(process.cwd());
	const filePath = path.resolve(values.file.replace(/^~(?=$|\/)/, homedir()));
	if (!existsSync(filePath)) fail('The leavers file does not exist.');
	const real = realpathSync(filePath);
	if (real === repo || real.startsWith(repo + path.sep))
		fail('The leavers file must be outside this repo (put it in ~/secure/syravia/imports/).');
	const leavers = readLeavers(readFileSync(filePath, 'utf8'));

	const url = process.env.DATABASE_URL;
	if (!url) fail('DATABASE_URL is not set. Run with --env-file=.env.');
	const dbName = new URL(url).pathname.replace(/^\//, '');
	if (dbName !== values.database)
		fail(`The database is "${dbName}", not "${values.database}". Nothing was done.`);

	const sql = postgres(url, { max: 1 });
	try {
		const candidates = await sql<Candidate[]>`
			SELECT s.id, s.team_id, lower(s.work_email) AS work_email, lower(s.personal_email) AS personal_email
			FROM staff s
			WHERE s.created_at::date = ${CREATED_ON}`;

		// Every leaver must match exactly one person of the batch.
		const matches = leavers.map((leaver) => ({
			leaver,
			hits: candidates.filter(
				(c) => c.work_email === leaver.email || c.personal_email === leaver.email
			)
		}));
		const unmatched = matches.filter((m) => m.hits.length !== 1);
		if (unmatched.length > 0) {
			for (const m of unmatched)
				console.log(`Line ${m.leaver.line}: ${m.hits.length} matches (expected 1).`);
			console.log('Nothing was done. Fix those lines and run again.');
			process.exitCode = 2;
			return;
		}

		// Plan every change first, so a bad row stops the whole run.
		const plans = [];
		for (const { leaver, hits } of matches) {
			const [hit] = hits;
			const endsAt = parseDate(leaver.lastDay).add({ days: 1 }).toDate('Asia/Damascus');
			const open = await sql<{ id: string; valid_from: Date }[]>`
				SELECT id, valid_from FROM staff_team_membership
				WHERE staff_id = ${hit.id} AND valid_to IS NULL`;
			if (open.length > 1)
				fail(`Line ${leaver.line}: more than one open membership. Nothing was done.`);
			if (open[0] && open[0].valid_from >= endsAt)
				fail(`Line ${leaver.line}: the membership starts after the last day. Nothing was done.`);
			const [{ n }] = await sql<{ n: number }[]>`
				SELECT count(*)::int AS n FROM attendance_event
				WHERE staff_id = ${hit.id} AND shift_date > ${leaver.lastDay} AND NOT is_void`;
			plans.push({
				line: leaver.line,
				lastDay: leaver.lastDay,
				staffId: hit.id,
				teamId: hit.team_id,
				membershipId: open[0]?.id ?? null,
				endsAt,
				punchesAfter: n
			});
		}

		for (const p of plans)
			console.log(
				`Line ${p.line}: last day ${p.lastDay}; ` +
					(p.teamId ? 'team ends the day after' : 'no team to end') +
					`; punches after the last day: ${p.punchesAfter}.`
			);

		const changing = plans.filter((p) => p.teamId !== null);
		try {
			await sql.begin(async (tx) => {
				for (const p of changing) {
					if (p.membershipId)
						await tx`UPDATE staff_team_membership SET valid_to = ${p.endsAt} WHERE id = ${p.membershipId}`;
					await tx`UPDATE staff SET team_id = NULL, updated_at = now() WHERE id = ${p.staffId}`;
					await tx`
						INSERT INTO audit_log (action, entity_type, entity_id, before, after, reason)
						VALUES ('staff.leave_end', 'staff', ${p.staffId},
							${tx.json({ teamId: p.teamId })},
							${tx.json({ teamId: null, membershipEndsAt: p.endsAt.toISOString() })},
							${REASON})`;
				}
				if (!values.commit) throw new DryRun();
			});
		} catch (error) {
			if (!(error instanceof DryRun)) throw error;
			console.log('Dry run: nothing was written (rolled back). Run again with --commit to apply.');
			return;
		}
		console.log(
			`Committed: ${changing.length} team memberships ended (${plans.length} leavers checked).`
		);
	} finally {
		await sql.end();
	}
}

await main();
