// Read-only report: the Odoo badge numbers of the people who came from Odoo without being in HR's
// workbook (the "Odoo-only" group, SP14). It writes one HTML page with badge numbers only to
// ~/secure/syravia/reports/ (folder 700, file 600). It prints counts and the file path, never a
// name or a badge number.
//
// Run from the attendance-app folder, on the database the user chooses:
//   pnpm exec tsx --env-file=.env scripts/odoo-only-badges.ts [--expect 22]
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';

// The 22 staff rows were added in one batch on this day, with no team (checked with counts before
// this script was written).
const CREATED_ON = '2026-11-12';

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function expectedCount(): number {
	const index = process.argv.indexOf('--expect');
	if (index === -1) return 22;
	const value = Number(process.argv[index + 1]);
	if (!Number.isInteger(value) || value < 0) fail('--expect must be a whole number.');
	return value;
}

function page(badges: string[], missing: number, madeOn: string): string {
	const rows = badges.map((badge) => `      <tr><td>${badge}</td></tr>`).join('\n');
	const note =
		missing > 0 ? `<p>${missing} people have no Odoo badge in the app and are not listed.</p>` : '';
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Odoo-only badges</title>
<style>
  body { font: 17px/1.6 system-ui, sans-serif; margin: 16px; color: #1d2433; background: #fff; }
  table { border-collapse: collapse; }
  td { border: 1px solid #d9dee7; padding: 4px 16px; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>${badges.length} Odoo-only people</h1>
<p>Badge numbers only. Made ${madeOn}. Search the page with Ctrl+F.</p>
<table>
${rows}
</table>
${note}
</body>
</html>
`;
}

async function main(): Promise<void> {
	const expected = expectedCount();
	const url = process.env.DATABASE_URL;
	if (!url) fail('DATABASE_URL is not set. Run with --env-file=.env.');

	const sql = postgres(url, { max: 1 });
	try {
		const rows = await sql<{ badge: string | null }[]>`
			SELECT s.legacy_badge_no AS badge
			FROM staff s
			WHERE s.created_at::date = ${CREATED_ON}`;

		if (rows.length !== expected) {
			console.log(
				`Stopped: found ${rows.length} people, expected ${expected}. Nothing was written.`
			);
			process.exitCode = 2;
			return;
		}

		const badges = rows
			.map((row) => row.badge)
			.filter((badge): badge is string => badge !== null)
			.sort((a, b) => Number(a) - Number(b));
		const missing = rows.length - badges.length;

		const dir = join(homedir(), 'secure', 'syravia', 'reports');
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		const file = join(dir, 'odoo-only-badges.html');
		const madeOn = new Date().toISOString().slice(0, 10);
		writeFileSync(file, page(badges, missing, madeOn), { mode: 0o600 });
		chmodSync(file, 0o600);

		console.log(`Found ${rows.length} people (${missing} without an Odoo badge).`);
		console.log(`Wrote the badge list to: ${file}`);
	} finally {
		await sql.end();
	}
}

await main();
