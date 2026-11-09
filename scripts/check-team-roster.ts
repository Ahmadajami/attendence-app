/**
 * Check a team's monthly roster workbook against a cycle pattern
 * (plans/2026-11-09-operations-roster-nov-2026.md Phase 2). Read-only: it never writes.
 *
 *   pnpm exec tsx --env-file=.env scripts/check-team-roster.ts plan|verify \
 *     --file ~/secure/syravia/imports/rosters/2026-10/<file>.xlsx --month 2026-10 \
 *     --team <id> --pattern <id> --anchor 2026-10-31 --code D=D8 --code N=N8 [--sheet <name>]
 *
 * The workbook: column A the employee number, column B the name (never read), column C day 1 and
 * so on by position (the header is not trusted). `O` is an off day; `--code` maps the other codes to
 * shift codes. Rows with an unknown, inactive or non-member number refuse the run; a repeated number
 * keeps the fuller row and reports the other.
 *
 * - `plan`: per row the staff record ID, the crew start that fits (and the form's choice), the
 *   employee page, the days that don't fit, and the employee swaps that explain them.
 * - `verify`: the app's roster (assignments, anchors, memberships, own rules, swaps, day edits,
 *   absences, holidays) for every member and day, through `rosterDay`; each day must be planned by
 *   `--pattern` and give the file's shift. Prints the match count and each mismatch.
 *
 * Output: workbook row numbers, record IDs, dates and shift codes only (CLAUDE.md §1).
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseDate } from '@internationalized/date';
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, gt, sql } from 'drizzle-orm';
import { readSheet } from 'read-excel-file/node';
import { addDays, daysBetween, startOfDamascusDay } from '../src/lib/roster/cycle.js';
import {
	dropDuplicateRows,
	findSwaps,
	fitRow,
	readWorkbookRows,
	type CycleCodes,
	type DayCode,
	type SheetCell
} from '../src/lib/roster/fit-roster.js';
import { rosterInputOf, type RosterData } from '../src/lib/roster/input.js';
import { rosterDay, teamOnDate } from '../src/lib/roster/roster.js';
import { normalizeSlots } from '../src/lib/server/services/slots.js';
import { ancestorChain } from '../src/lib/workforce/departments.js';
import { connect, fail, schema } from './lib.js';

const {
	values: args,
	positionals: [mode]
} = parseArgs({
	allowPositionals: true,
	options: {
		file: { type: 'string' },
		sheet: { type: 'string' },
		month: { type: 'string' },
		team: { type: 'string' },
		pattern: { type: 'string' },
		anchor: { type: 'string' },
		code: { type: 'string', multiple: true, default: [] }
	}
});

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expandHome = (value: string) =>
	value === '~' || value.startsWith('~/') ? path.join(homedir(), value.slice(1)) : value;

if (mode !== 'plan' && mode !== 'verify') fail('First argument: plan or verify.');
for (const key of ['file', 'month', 'team', 'pattern', 'anchor'] as const)
	if (!args[key]) fail(`--${key} is required.`);

const file = path.resolve(expandHome(args.file!));
if (!existsSync(file)) fail('--file does not exist.');
const repo = realpathSync(REPO);
if (realpathSync(file).startsWith(repo + path.sep))
	fail('Refusing a workbook inside the repo (real data stays in ~/secure/syravia/).');

const month = args.month!;
if (!/^\d{4}-\d{2}$/.test(month)) fail('--month must be YYYY-MM.');
const first = `${month}-01`;
const days = daysBetween(first, parseDate(first).add({ months: 1 }).toString());
const dates = Array.from({ length: days }, (_, i) => addDays(first, i));
const anchorDate = args.anchor!;
try {
	if (parseDate(anchorDate).toString() !== anchorDate) throw new Error();
} catch {
	fail('--anchor must be a real YYYY-MM-DD date.');
}

/** Workbook code (upper case) → shift code; `O` is off. */
const fileCodes = new Map<string, string>();
for (const pair of args.code!) {
	const match = pair.match(/^([A-Za-z]+)=(\S+)$/);
	if (!match) fail(`--code must look like D=D8 (got "${pair}").`);
	fileCodes.set(match[1].toUpperCase(), match[2]);
}

const show = (code: DayCode | undefined) => (code === undefined ? 'empty' : (code ?? 'off'));

const db = connect();
try {
	const [{ name: database }] = (await db.execute<{ name: string }>(
		sql`select current_database() as name`
	)) as unknown as { name: string }[];

	const shifts = await db
		.select({
			id: schema.shift.id,
			code: schema.shift.code,
			nameEn: schema.shift.nameEn,
			nameAr: schema.shift.nameAr,
			colour: schema.shift.colour,
			startTime: schema.shift.startTime,
			endTime: schema.shift.endTime,
			breakMinutes: schema.shift.breakMinutes,
			requiredMinutes: schema.shift.requiredMinutes,
			windowBeforeMinutes: schema.shift.windowBeforeMinutes,
			windowAfterMinutes: schema.shift.windowAfterMinutes,
			graceMinutes: schema.shift.graceMinutes,
			active: schema.shift.active
		})
		.from(schema.shift);
	const codeOf = new Map(shifts.map((s) => [s.id, s.code]));
	const knownCodes = new Set(shifts.map((s) => s.code));
	for (const code of fileCodes.values())
		if (!knownCodes.has(code)) fail(`--code: no shift with code "${code}".`);

	const [pattern] = await db
		.select({ id: schema.pattern.id, type: schema.pattern.type, slots: schema.pattern.slots })
		.from(schema.pattern)
		.where(eq(schema.pattern.id, args.pattern!));
	if (!pattern) fail('--pattern: no such pattern.');
	if (pattern.type !== 'cycle') fail('--pattern must be a cycle pattern.');
	const cycle: CycleCodes = {
		slots: normalizeSlots(pattern.slots).map((id) => (id === null ? null : codeOf.get(id)!)),
		anchorDate
	};

	const [team] = await db
		.select({ id: schema.team.id })
		.from(schema.team)
		.where(eq(schema.team.id, args.team!));
	if (!team) fail('--team: no such team.');

	// --- the workbook ---
	const sheet = (await readSheet(file, args.sheet)) as unknown as SheetCell[][];
	const codes = new Map<string, DayCode>([['O', null], ...fileCodes]);
	const parsed = readWorkbookRows(sheet, days, codes);
	const { kept, duplicates } = dropDuplicateRows(parsed.rows);
	if (kept.length === 0) fail('No person rows (column A = employee number) in the workbook.');

	console.log(`database: ${database}; mode: ${mode}; month: ${month} (${days} days)`);
	console.log(`workbook: ${parsed.rows.length} person rows, ${kept.length} people`);
	for (const d of duplicates)
		console.log(
			`  row ${d.row}: same employee number as row ${d.of}; ignored (${d.filled} filled days)`
		);
	for (const issue of parsed.issues)
		console.log(
			issue.code === 'unknown_code'
				? `  row ${issue.row}, day ${issue.day}: unknown code "${issue.value}" (not compared)`
				: `  row ${issue.row}: roster codes but no employee number (not read)`
		);

	// --- the people ---
	const staff = await db
		.select({
			id: schema.staff.id,
			employeeNo: schema.staff.employeeNo,
			active: schema.staff.active,
			departmentId: schema.staff.departmentId
		})
		.from(schema.staff)
		.where(
			inArray(
				schema.staff.employeeNo,
				kept.map((r) => r.employeeNo)
			)
		);
	const byNo = new Map(staff.map((s) => [s.employeeNo, s]));
	const staffIds = staff.map((s) => s.id);
	const start = startOfDamascusDay(first);
	const end = startOfDamascusDay(addDays(first, days));
	const memberships = staffIds.length
		? await db
				.select({
					staffId: schema.staffTeamMembership.staffId,
					teamId: schema.staffTeamMembership.teamId,
					validFrom: schema.staffTeamMembership.validFrom,
					validTo: schema.staffTeamMembership.validTo
				})
				.from(schema.staffTeamMembership)
				.where(
					and(
						inArray(schema.staffTeamMembership.staffId, staffIds),
						lt(schema.staffTeamMembership.validFrom, end),
						or(
							isNull(schema.staffTeamMembership.validTo),
							gt(schema.staffTeamMembership.validTo, start)
						)
					)
				)
		: [];

	const refused: string[] = [];
	const people = kept.map((row) => {
		const person = byNo.get(row.employeeNo);
		if (!person) {
			refused.push(`row ${row.row}: unknown employee number`);
			return null;
		}
		if (!person.active) refused.push(`row ${row.row}: inactive (${person.id})`);
		const own = memberships.filter((m) => m.staffId === person.id);
		const inTeam = dates.filter((date) => teamOnDate(own, date) === team.id);
		if (inTeam.length === 0)
			refused.push(`row ${row.row}: not a member of the team in ${month} (${person.id})`);
		else if (inTeam.length < days)
			console.log(`  row ${row.row}: in the team on ${inTeam.length} of ${days} days`);
		return { ...row, person };
	});
	if (refused.length) {
		for (const line of refused) console.log(`  REFUSED ${line}`);
		fail('Refused rows: fix the workbook or the team, then run again.');
	}
	const rows = people.map((p) => p!);

	if (mode === 'plan') {
		console.log(`\npattern ${pattern.id}, anchor ${anchorDate}, ${cycle.slots.length}-day cycle`);
		const fitted = rows.map((row) => {
			const fit = fitRow(cycle, dates, row.cells);
			return { row, fit, crewStart: fit.crewStarts[0] };
		});
		console.log('\nrow | staff record | crew start | UI choice | employee page | odd days');
		for (const { row, fit, crewStart } of fitted) {
			const tie = fit.crewStarts.length > 1 ? ` (tie: ${fit.crewStarts.join(', ')})` : '';
			console.log(
				`${row.row} | ${row.person.id} | ${crewStart}${tie} | Crew start: day ${crewStart + 1} | ` +
					`/employees/${row.person.id}?tab=schedule | ${fit.misses.length}` +
					(fit.missing.length ? ` (${fit.missing.length} empty days)` : '')
			);
		}
		const swapFit = findSwaps(
			cycle,
			dates,
			fitted.map(({ row, crewStart }) => ({ key: row, crewStart, cells: row.cells }))
		);
		console.log(`\nswaps that explain odd days: ${swapFit.swaps.length}`);
		for (const s of swapFit.swaps)
			console.log(
				`  employee swap: A = row ${s.a.row} (${s.a.person.id}), B = row ${s.b.row} ` +
					`(${s.b.person.id}); date ${s.date}, return ${s.returnDate ?? 'none'}`
			);
		console.log(`unexplained odd days: ${swapFit.unexplained.length}`);
		for (const u of swapFit.unexplained)
			console.log(`  row ${u.key.row} ${u.date}: cycle ${show(u.expected)}, file ${show(u.got)}`);
		const filled = rows.reduce((n, r) => n + r.cells.filter((c) => c !== undefined).length, 0);
		const odd = fitted.reduce((n, f) => n + f.fit.misses.length, 0);
		console.log(
			`\nfit: ${filled - odd}/${filled} days on the cycle; ${odd - swapFit.unexplained.length} ` +
				`explained by swaps; ${swapFit.unexplained.length} unexplained`
		);
	} else {
		const last = dates[days - 1];
		const [departments, schedules, overrides, absences, personal] = await Promise.all([
			db
				.select({ id: schema.department.id, parentId: schema.department.parentId })
				.from(schema.department),
			db
				.select({
					staffId: schema.staffSchedule.staffId,
					offWeekdays: schema.staffSchedule.offWeekdays,
					crewStart: schema.staffSchedule.crewStart,
					effectiveFrom: schema.staffSchedule.effectiveFrom,
					effectiveTo: schema.staffSchedule.effectiveTo
				})
				.from(schema.staffSchedule)
				.where(inArray(schema.staffSchedule.staffId, staffIds))
				.orderBy(asc(schema.staffSchedule.effectiveFrom)),
			db
				.select({
					staffId: schema.rosterOverride.staffId,
					shiftDate: schema.rosterOverride.shiftDate,
					shiftId: schema.rosterOverride.shiftId,
					swapGroupId: schema.rosterOverride.swapGroupId
				})
				.from(schema.rosterOverride)
				.where(
					and(
						inArray(schema.rosterOverride.staffId, staffIds),
						isNull(schema.rosterOverride.cancelledAt),
						gte(schema.rosterOverride.shiftDate, first),
						lte(schema.rosterOverride.shiftDate, last)
					)
				),
			db
				.select({
					staffId: schema.absence.staffId,
					startsOn: schema.absence.startsOn,
					endsOn: schema.absence.endsOn,
					type: schema.absence.type
				})
				.from(schema.absence)
				.where(
					and(
						inArray(schema.absence.staffId, staffIds),
						isNull(schema.absence.cancelledAt),
						lte(schema.absence.startsOn, last),
						gte(schema.absence.endsOn, first)
					)
				),
			assignments(inArray(schema.patternAssignment.staffId, staffIds))
		]);
		const departmentChains = Object.fromEntries(
			rows.map((r) => [r.person.id, ancestorChain(departments, r.person.departmentId)])
		);
		const teamIds = [...new Set(memberships.map((m) => m.teamId))];
		const departmentIds = [...new Set(Object.values(departmentChains).flat())];
		const [teamAssignments, departmentAssignments] = await Promise.all([
			teamIds.length ? assignments(inArray(schema.patternAssignment.teamId, teamIds)) : [],
			departmentIds.length
				? assignments(inArray(schema.patternAssignment.departmentId, departmentIds))
				: []
		]);
		const patternIds = [
			...new Set(
				[...personal, ...teamAssignments, ...departmentAssignments].map((a) => a.patternId)
			)
		];
		const [holidays, holidayExceptions] = await Promise.all([
			db
				.select({
					id: schema.patternHoliday.id,
					patternId: schema.patternHoliday.patternId,
					startsOn: schema.patternHoliday.startsOn,
					endsOn: schema.patternHoliday.endsOn,
					otEligible: schema.patternHoliday.otEligible
				})
				.from(schema.patternHoliday)
				.where(
					and(
						patternIds.length
							? or(
									isNull(schema.patternHoliday.patternId),
									inArray(schema.patternHoliday.patternId, patternIds)
								)
							: isNull(schema.patternHoliday.patternId),
						isNull(schema.patternHoliday.cancelledAt),
						lte(schema.patternHoliday.startsOn, last),
						gte(schema.patternHoliday.endsOn, first)
					)
				),
			patternIds.length
				? db
						.select({
							patternId: schema.patternHolidayException.patternId,
							holidayId: schema.patternHolidayException.holidayId,
							applies: schema.patternHolidayException.applies,
							otEligible: schema.patternHolidayException.otEligible
						})
						.from(schema.patternHolidayException)
						.where(inArray(schema.patternHolidayException.patternId, patternIds))
				: []
		]);

		const data: RosterData = {
			shifts,
			memberships,
			personalAssignments: personal,
			teamAssignments,
			departmentAssignments,
			departmentChains,
			schedules,
			overrides,
			absences,
			holidays,
			holidayExceptions
		};

		console.log(
			`\npattern ${pattern.id}; app data: ${overrides.length} day edits/swap days, ` +
				`${schedules.length} own-rule versions, ${absences.length} absences`
		);
		let compared = 0;
		let matched = 0;
		const mismatches: string[] = [];
		for (const row of rows) {
			const input = rosterInputOf(data, row.person.id);
			dates.forEach((date, i) => {
				const want = row.cells[i];
				if (want === undefined) return;
				compared++;
				const day = rosterDay(input, date);
				const got = day.shift?.code ?? null;
				const onPattern = day.patternId === pattern.id;
				if (got === want && onPattern) {
					matched++;
					return;
				}
				const why = onPattern
					? ''
					: day.patternId === null
						? ' [no pattern plans the day]'
						: ` [planned by another pattern ${day.patternId}]`;
				mismatches.push(
					`  row ${row.row} ${date}: file ${show(want)}, app ${show(got)} (${day.source})${why}`
				);
			});
		}
		console.log(`match: ${matched}/${compared}; mismatches: ${mismatches.length}`);
		for (const line of mismatches) console.log(line);
	}
} finally {
	await db.close();
}

/** Pattern assignments joined with their pattern, oldest first (as `roster.crud.ts` reads them). */
async function assignments(where: ReturnType<typeof inArray>) {
	const rows = await db
		.select({
			id: schema.patternAssignment.id,
			patternId: schema.patternAssignment.patternId,
			teamId: schema.patternAssignment.teamId,
			staffId: schema.patternAssignment.staffId,
			departmentId: schema.patternAssignment.departmentId,
			type: schema.pattern.type,
			slots: schema.pattern.slots,
			defaultWorkShiftId: schema.pattern.defaultWorkShiftId,
			anchorDate: schema.patternAssignment.anchorDate,
			effectiveFrom: schema.patternAssignment.effectiveFrom,
			effectiveTo: schema.patternAssignment.effectiveTo
		})
		.from(schema.patternAssignment)
		.innerJoin(schema.pattern, eq(schema.pattern.id, schema.patternAssignment.patternId))
		.where(where)
		.orderBy(asc(schema.patternAssignment.effectiveFrom));
	return rows.map((row) => ({ ...row, slots: normalizeSlots(row.slots) }));
}
