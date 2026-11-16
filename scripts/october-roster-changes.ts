/**
 * October roster-change finder (plan 2026-11-15-october-excel-reconciliation.md, the "roster
 * changes late in October" brief). Reads nothing but the workbooks in the given folder; no
 * database, no network. It answers:
 *
 * 1. per team, the first date from which the team's set of people changed compared with the
 *    previous day present in the files (added/removed counts, and whether it changed again
 *    later); teams that never changed are reported as "no change";
 * 2. which pairs of daily files carry identical rows (a repeated day to check before import),
 *    and for the pairs that are not identical, how many rows appear on two different days.
 *
 *   pnpm tsx scripts/october-roster-changes.ts \
 *     --folder ~/secure/syravia/imports/october-2026 \
 *     --report ~/secure/syravia/reports/october-roster-changes.txt
 *
 * The analysis lives in `src/lib/server/imports/october-reconcile.ts` (tested with made-up
 * workbooks). The console prints counts, dates, team names and file dates only — never a name,
 * badge, employee ID or cell value (CLAUDE.md §1). Full per-day lists and the pair table go to
 * `--report` (mode 600, outside the repo). A file whose team column cannot be found is not
 * guessed: its date and header names are printed once and it is skipped for that pass.
 */
import { chmodSync, existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
	analyseFolder,
	type FileRef,
	type OctoberAnalysis
} from '../src/lib/server/imports/october-reconcile.js';

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
const refLabel = (ref: FileRef) =>
	`${ref.kind === 'daily' ? '' : 'correction '}${dayLabel(ref.day)}`;

function buildReport(analysis: OctoberAnalysis, folder: string): string {
	const lines: string[] = [];
	lines.push('October roster-change report');
	lines.push(`generated: ${new Date().toISOString()}`);
	lines.push(`folder: ${folder}`);
	lines.push('');
	lines.push('## Files');
	lines.push(
		`daily: ${analysis.daily.length} (${analysis.daily.map((ref) => ref.day).join(', ') || 'none'})`
	);
	lines.push(
		`corrections: ${analysis.corrections.length} (${
			analysis.corrections.map((correction) => correction.ref.day).join(', ') || 'none'
		})`
	);
	lines.push(`range files skipped (not read): ${analysis.rangeFiles}`);
	lines.push(`LibreOffice lock files skipped: ${analysis.lockFiles}`);
	lines.push(`other xlsx files ignored (names not shown): ${analysis.otherXlsx}`);
	lines.push('');
	for (const file of analysis.files) {
		lines.push(
			`file ${refLabel(file)}: ${file.rows} rows, ${file.noTeamRows} without a team, ` +
				`${file.noIdRows} with an empty ID, date columns excluded from the row signature: ` +
				`${file.dateColumns.join(' | ') || 'none'}`
		);
	}
	lines.push('');
	lines.push('## Problems');
	if (analysis.problems.length === 0) lines.push('none');
	for (const problem of analysis.problems) {
		if (problem.reason === 'no_team_column')
			lines.push(
				`file ${refLabel(problem.ref)}: team column not found — headers: ${problem.headers.join(' | ')}`
			);
		else lines.push(`file ${refLabel(problem.ref)}: ${problem.reason.replace(/_/g, ' ')}`);
	}
	lines.push('');
	lines.push('## Files without an ID column (row contents used as the person identity)');
	if (analysis.noIdColumns.length === 0) lines.push('none');
	for (const ref of analysis.noIdColumns) lines.push(`file ${refLabel(ref)}`);
	lines.push('');
	lines.push('## Teams (daily files only)');
	for (const team of analysis.teams) {
		const perDay =
			team.perDay.map((day) => `${day.day}:${day.people}`).join(' ') || '(no daily rows)';
		lines.push(`team ${team.team}: ${perDay}`);
		for (const change of team.changes)
			lines.push(
				`  change ${dayLabel(change.day)}: added ${change.added}, removed ${change.removed}`
			);
		if (team.changes.length === 0) lines.push('  no change between the days present');
	}
	lines.push('');
	lines.push('## Duplicate daily pairs');
	for (const pair of analysis.duplicates)
		lines.push(
			pair.identical
				? `${dayLabel(pair.a.day)} == ${dayLabel(pair.b.day)}: identical rows`
				: `${dayLabel(pair.a.day)} ~ ${dayLabel(pair.b.day)}: ${pair.shared} rows shared`
		);
	lines.push('');
	lines.push('## Correction files (separate inputs, not merged into the daily days)');
	for (const correction of analysis.corrections) {
		lines.push(
			`correction ${dayLabel(correction.ref.day)}: ${correction.rows} rows; shared with daily ` +
				correction.sharedByDay
					.filter((day) => day.shared > 0)
					.map((day) => `${dayLabel(day.day)}:${day.shared}`)
					.join(' ')
		);
		if (!correction.sharedByDay.some((day) => day.shared > 0))
			lines.push('  shared with no daily file');
	}
	return lines.join('\n') + '\n';
}

const analysis = await analyseFolder(folder);

console.log('October roster-change scan');
console.log(`folder: ${folder}`);
const daySpan = (refs: readonly FileRef[]) => {
	if (refs.length === 0) return 'none';
	const first = refs[0].day;
	const last = refs[refs.length - 1].day;
	return first === last ? String(first) : `${first}–${last}`;
};
console.log(
	`files: daily ${analysis.daily.length} (${daySpan(analysis.daily)}), corrections ` +
		`${analysis.corrections.length} (${
			analysis.corrections.map((correction) => correction.ref.day).join(', ') || 'none'
		}), ` +
		`other xlsx ${analysis.otherXlsx}, lock files ${analysis.lockFiles}`
);
if (analysis.rangeFiles > 0) console.log('RANGE_FILE skipped');

for (const problem of analysis.problems) {
	if (problem.reason === 'no_team_column') {
		console.log(
			`file ${dayLabel(problem.ref.day)} (${problem.ref.kind}): team column not found — ` +
				`headers: ${problem.headers.join(' | ')}; file skipped`
		);
	} else {
		console.log(
			`file ${dayLabel(problem.ref.day)} (${problem.ref.kind}): ${problem.reason.replace(/_/g, ' ')}; file skipped`
		);
	}
}
for (const ref of analysis.noIdColumns)
	console.log(
		`file ${dayLabel(ref.day)} (${ref.kind}): no ID column; row contents used as identity`
	);

const changed = analysis.teams.filter((team) => team.firstChangeDay !== null);
console.log(
	`teams: ${analysis.teams.length} analysed, ${changed.length} changed, ` +
		`${analysis.teams.length - changed.length} with no change`
);
for (const team of analysis.teams) {
	if (team.firstChangeDay === null) {
		const people = team.perDay[0]?.people ?? 0;
		console.log(`team ${team.team}: no change (${people} people on ${team.daysPresent} days)`);
	} else {
		const later = team.changes.slice(1).map((change) => dayLabel(change.day));
		console.log(
			`team ${team.team}: first change ${dayLabel(team.firstChangeDay)} ` +
				`(added ${team.added}, removed ${team.removed}); changed again later: ` +
				(later.length ? `yes (${later.join(', ')})` : 'no')
		);
	}
}

const identical = analysis.duplicates.filter((pair) => pair.identical);
const sharing = analysis.duplicates.filter((pair) => !pair.identical && pair.shared > 0);
const disjoint = analysis.duplicates.length - identical.length - sharing.length;
console.log(
	`identical daily files (repeated days): ${
		identical.map((pair) => `${dayLabel(pair.a.day)} == ${dayLabel(pair.b.day)}`).join('; ') ||
		'none'
	}`
);
console.log(
	`daily pairs with shared rows: ${
		sharing
			.map((pair) => `${dayLabel(pair.a.day)} ~ ${dayLabel(pair.b.day)} (${pair.shared})`)
			.join('; ') || 'none'
	}`
);
console.log(`daily pairs with nothing shared: ${disjoint} of ${analysis.duplicates.length}`);
for (const correction of analysis.corrections) {
	const best = correction.sharedByDay.reduce((top, day) => (day.shared > top.shared ? day : top), {
		day: 0,
		shared: -1
	});
	console.log(
		`correction ${dayLabel(correction.ref.day)}: ${correction.rows} rows; ` +
			(best.shared > 0
				? `up to ${best.shared} of them match daily file ${dayLabel(best.day)}`
				: 'no rows match a daily file')
	);
}

if (reportPath) {
	mkdirSync(path.dirname(reportPath), { recursive: true, mode: 0o700 });
	writeFileSync(reportPath, buildReport(analysis, folder), { mode: 0o600 });
	chmodSync(reportPath, 0o600);
	console.log(`report written (mode 600): ${reportPath}`);
}
