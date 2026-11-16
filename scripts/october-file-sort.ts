/**
 * October file sorter (plan 2026-11-15-october-excel-reconciliation.md, the READY/PENDING brief).
 * Reads only the workbooks in the given folder; no database, no writes to anything but the report.
 * Per daily and correction file it runs the seven checks of the brief (stop at the first failure)
 * and sorts the folder:
 *
 *   READY     passes every check — can be inserted as it is (nothing is inserted here)
 *   PENDING   fails a check — not inserted, with the reason code
 *   SKIPPED   `.~lock` lock files (names printed) and other xlsx files (counted, names not shown)
 *
 *   pnpm tsx scripts/october-file-sort.ts \
 *     --folder ~/secure/syravia/imports/october-2026 \
 *     --report ~/secure/syravia/reports/october-file-sort.txt
 *
 * The analysis lives in `src/lib/server/imports/october-sort.ts` (tested with made-up workbooks).
 * The console prints counts, file dates and reason codes only — never a name, badge, employee ID
 * or cell value (CLAUDE.md §1). Per-file detail (also dates and codes only) goes to `--report`
 * (mode 600, outside the repo).
 */
import { chmodSync, existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sortFolder, type SortResult } from '../src/lib/server/imports/october-sort.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function expandHome(value: string): string {
	return value === '~' || value.startsWith('~/') ? path.join(homedir(), value.slice(1)) : value;
}

/** Real path of a file or folder; never inside the repo (real data stays in ~/secure/syravia/). */
function outsideRepo(value: string, label: string): string {
	const target = path.resolve(expandHome(value));
	const real = existsSync(target)
		? realpathSync(target)
		: path.join(realpathSync(path.dirname(target)), path.basename(target));
	if (real === REPO || real.startsWith(REPO + path.sep))
		fail(`Refusing ${label} inside the repo (real data stays in ~/secure/syravia/).`);
	return real;
}

const { values: args } = parseArgs({
	options: {
		folder: { type: 'string' },
		report: { type: 'string' }
	}
});

if (!args.folder) fail('--folder <path to the October workbooks> is required.');
const folder = outsideRepo(args.folder, '--folder');
if (!statSync(folder).isDirectory()) fail(`--folder is not a directory: ${folder}`);
const reportPath = args.report ? outsideRepo(args.report, '--report') : null;

const dayLabel = (day: number) => `${String(day).padStart(2, '0')}-10-2026`;
const refLabel = (result: SortResult) =>
	result.kind === 'daily' || result.kind === 'correction'
		? `${result.kind === 'correction' ? 'correction ' : ''}${dayLabel(result.day!)}`
		: result.kind === 'range'
			? 'range file'
			: result.kind === 'lock'
				? `lock file ${result.name}`
				: 'other xlsx';

function buildReport(results: SortResult[], folder: string): string {
	const lines: string[] = [];
	lines.push('October file sort report');
	lines.push(`generated: ${new Date().toISOString()}`);
	lines.push(`folder: ${folder}`);
	lines.push('');
	for (const result of results) {
		const metrics =
			result.kind === 'daily' || result.kind === 'correction'
				? ` | rows ${result.rows}, rows without an ID ${result.noIdRows}, ` +
					`rows without a date ${result.noDateRows}, rows of another day ${result.foreignDateRows} ` +
					`(distinct other days ${result.foreignDates}), repeated ID+date rows ${result.duplicateRows}` +
					(result.identicalTo.length
						? `, exact copy of ${result.identicalTo.map(dayLabel).join(', ')}`
						: '')
				: '';
		lines.push(
			`${refLabel(result)}: ${result.status.toUpperCase()}${result.reason ? ` ${result.reason}` : ''}${metrics}`
		);
	}
	return lines.join('\n') + '\n';
}

const results = await sortFolder(folder);

const ready = results.filter((result) => result.status === 'ready');
const pending = results.filter((result) => result.status === 'pending');
const locks = results.filter((result) => result.kind === 'lock');
const others = results.filter((result) => result.kind === 'other');

console.log('October file sort');
console.log(`folder: ${folder}`);
const work = results.filter((result) => result.kind === 'daily' || result.kind === 'correction');
const daySpan = (days: readonly number[]) => {
	if (days.length === 0) return 'none';
	const first = days[0];
	const last = days[days.length - 1];
	return first === last ? String(first) : `${first}–${last}`;
};
const dailyOnly = work.filter((result) => result.kind === 'daily');
const correctionOnly = work.filter((result) => result.kind === 'correction');
console.log(
	`files: daily ${dailyOnly.length} (${daySpan(dailyOnly.map((result) => result.day!))}), corrections ` +
		`${correctionOnly.length} (${daySpan(correctionOnly.map((result) => result.day!))}), ` +
		`range files ${results.filter((result) => result.kind === 'range').length}, ` +
		`lock files ${locks.length}, other xlsx ${others.length}`
);
if (locks.length) console.log(`SKIPPED: ${locks.map((lock) => lock.name).join(', ')}`);

console.log(
	`READY (${ready.length}): ${
		ready.map((result) => `${refLabel(result)} (${result.rows} rows)`).join('; ') || 'none'
	}`
);
console.log(
	`PENDING (${pending.length}): ${
		pending
			.map((result) =>
				result.kind === 'range'
					? 'range file RANGE_NOT_IN_SCOPE'
					: `${refLabel(result)} ${result.reason} (${result.rows} rows)`
			)
			.join('; ') || 'none'
	}`
);
console.log(
	`totals: ready ${ready.length}, pending ${pending.length}, rows ready ${ready.reduce(
		(sum, result) => sum + result.rows,
		0
	)}`
);

if (reportPath) {
	mkdirSync(path.dirname(reportPath), { recursive: true, mode: 0o700 });
	writeFileSync(reportPath, buildReport(results, folder), { mode: 0o600 });
	chmodSync(reportPath, 0o600);
	console.log(`report written (mode 600): ${reportPath}`);
}
