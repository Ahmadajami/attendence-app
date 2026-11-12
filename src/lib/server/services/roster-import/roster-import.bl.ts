// The roster import (plan 2026-11-12-roster-import; RI3–RI10, OC2–OC4): a month grid → per group
// (department, else team) a weekly pattern, own off days, personal patterns, self swaps and day
// edits; replayed through the roster before anything is saved; one batch, undone together.
import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import {
	fitTeams,
	joinableAssignment,
	replayFit,
	type FitInput,
	type GridCell,
	type TeamFit
} from '#lib/roster/fit-weekly.js';
import { addDays, daysBetween } from '#lib/roster/cycle.js';
import {
	GridDatesError,
	MissingColumnError,
	OFF_CODE,
	readRosterGrid
} from '#lib/roster/roster-file.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch as runBatch, db } from '#lib/server/db/index.js';
import {
	patternAssignment,
	rosterOverride,
	staffSchedule,
	swapRequest,
	type ImportBatch,
	type ImportRow
} from '#lib/server/db/schema/index.js';
import { ConflictError, InvalidInputError } from '#lib/server/errors.js';
import type { RawTable } from '#lib/server/imports/parse.js';
import { todayInDamascus } from '#lib/server/time.js';
import type {
	ImportRowDraft,
	RosterBatchSummary,
	RosterGroupSummary,
	RosterImportData
} from '#lib/types/imports.js';
import { canonicalJson } from '#lib/utils/canonical-json.js';
import { descendantIds } from '#lib/workforce/departments.js';
import { requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { listActiveStaffInDepartments } from '../attendance/attendance.crud.js';
import { causeBy, markNeedsRecompute, recomputeAfter } from '../day-results/day-results.bl.js';
import { listDepartmentRows } from '../departments/departments.crud.js';
import { insertPattern } from '../patterns/patterns.crud.js';
import { listStaffByEmployeeNo } from '../punch-import/punch-import.crud.js';
import { loadRosterData } from '../roster/roster.bl.js';
import { listTeamMembersBetween } from '../roster/roster.crud.js';
import { listShiftRows } from '../shifts/shifts.crud.js';
import { listTeams } from '../teams/teams.crud.js';
import {
	hasCommittedPunchesBetween,
	listPatternsByName,
	listRosterBatchRows,
	listSwapsBetween,
	setImportBatchStatus,
	undoRosterStatements
} from './roster-import.crud.js';
import { ROSTER_WRITE_PERMISSION } from './shift-import.bl.js';
import { startOfDamascusDay } from '#lib/roster/cycle.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const tally = (items: readonly string[]) => {
	const counts: Record<string, number> = {};
	for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
	return counts;
};

/** Does an assignment or rule version run on some date of `[from, next)`? */
const overlaps = (
	v: { effectiveFrom: string; effectiveTo: string | null },
	from: string,
	next: string
) => v.effectiveFrom < next && (v.effectiveTo === null || v.effectiveTo > from);

type Group = {
	key: string;
	label: string;
	kind: 'department' | 'team';
	targetId: string;
	refused: string | null;
};

/** Everything the save writes, without ids (the commit gives them). */
export type RosterBuild = {
	from: string;
	next: string;
	fits: (TeamFit & {
		group: Group;
		patternName: string | null;
		personalNames: string[];
		/** Per personal pattern: the id of the same pattern already saved (RI11), else `null`. */
		personalReuse: (string | null)[];
	})[];
	/** People whose days the save changes: the listed people and the unlisted members of a group. */
	touched: string[];
};

export type RosterFilePlan = {
	rows: ImportRowDraft[];
	summary: RosterBatchSummary;
	build: RosterBuild;
};

const monthLabel = (date: string) => {
	const d = new Date(`${date}T00:00:00Z`);
	return `${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}/${d.getUTCFullYear()}`;
};

/**
 * Read the grid and decide every line (RI5: never over an existing roster), fit each group and
 * replay the result through the roster with the people's stored rows.
 */
export async function planRosterFile(table: RawTable): Promise<RosterFilePlan> {
	let read: ReturnType<typeof readRosterGrid>;
	try {
		read = readRosterGrid(table);
	} catch (error) {
		if (error instanceof MissingColumnError)
			throw new InvalidInputError(
				'file_header',
				m.imports_error_punch_header({ header: error.header }),
				{ cause: error }
			);
		if (error instanceof GridDatesError)
			throw new InvalidInputError('roster_dates', m.imports_error_roster_dates(), { cause: error });
		throw error;
	}
	const { dates } = read;
	const from = dates[0];
	const to = dates.at(-1) as string;
	const next = addDays(to, 1);
	const month = monthLabel(from);

	const [shifts, departments, teams, people, patternsByName] = await Promise.all([
		listShiftRows(),
		listDepartmentRows(),
		listTeams(),
		listStaffByEmployeeNo(read.lines.map((l) => l.employeeNo)),
		listPatternsByName()
	]);
	const patternNameOf = new Map([...patternsByName.values()].map((p) => [p.id, p.nameEn]));
	const shiftByCode = new Map(shifts.filter((s) => s.active).map((s) => [s.code, s]));
	const codeOf = new Map(shifts.map((s) => [s.id, s.code]));
	const byNo = new Map(people.map((p) => [p.employeeNo, p]));
	const departmentByName = new Map(departments.map((d) => [d.nameEn.trim().toLowerCase(), d]));
	const teamByName = new Map(teams.map((t) => [t.nameEn.trim().toLowerCase(), t]));

	// ---- groups and line checks ----
	const groups = new Map<string, Group>();
	const groupOf = (line: (typeof read.lines)[number]): Group | null => {
		const department = line.department
			? departmentByName.get(line.department.toLowerCase())
			: undefined;
		const team =
			!line.department && line.team ? teamByName.get(line.team.toLowerCase()) : undefined;
		const target = department
			? { kind: 'department' as const, row: department }
			: team
				? { kind: 'team' as const, row: team }
				: null;
		if (!target) return null;
		const key = `${target.kind}:${target.row.id}`;
		if (!groups.has(key))
			groups.set(key, {
				key,
				label: target.row.nameEn,
				kind: target.kind,
				targetId: target.row.id,
				refused: null
			});
		return groups.get(key)!;
	};

	type Candidate = {
		line: number;
		employeeNo: string;
		group: Group;
		staffId: string;
		departmentId: string | null;
		cells: GridCell[];
	};
	const refusedLines = new Map<number, string>();
	const candidates: Candidate[] = [];
	const seen = new Set<string>();
	const lineGroup = new Map<number, Group>();
	for (const issue of read.issues) refusedLines.set(issue.line, issue.code);
	for (const line of read.lines) {
		const group = groupOf(line);
		if (!group) {
			refusedLines.set(line.line, 'unknown_group');
			continue;
		}
		lineGroup.set(line.line, group);
		const person = byNo.get(line.employeeNo);
		if (!person) {
			refusedLines.set(line.line, 'unknown_person');
			continue;
		}
		if (!person.active) {
			refusedLines.set(line.line, 'inactive_person');
			continue;
		}
		if (seen.has(person.staffId)) {
			refusedLines.set(line.line, 'duplicate_in_file');
			continue;
		}
		seen.add(person.staffId);
		if (group.kind === 'department') {
			const inside = new Set([group.targetId, ...descendantIds(departments, group.targetId)]);
			if (!person.departmentId || !inside.has(person.departmentId)) {
				refusedLines.set(line.line, 'not_in_department');
				continue;
			}
		}
		const unknown = line.codes.find((c) => c !== '' && c !== OFF_CODE && !shiftByCode.has(c));
		if (unknown !== undefined) {
			refusedLines.set(line.line, 'unknown_shift');
			continue;
		}
		candidates.push({
			line: line.line,
			employeeNo: line.employeeNo,
			group,
			staffId: person.staffId,
			departmentId: person.departmentId,
			cells: line.codes.map((c) =>
				c === '' ? undefined : c === OFF_CODE ? null : shiftByCode.get(c)!.id
			)
		});
	}

	// ---- what the app already plans in the month (RI5) ----
	const roster =
		candidates.length > 0
			? await loadRosterData(
					candidates.map((c) => ({ staffId: c.staffId, departmentId: c.departmentId })),
					from,
					daysBetween(from, next),
					[...groups.values()].filter((g) => g.kind === 'team').map((g) => g.targetId)
				)
			: null;
	const swaps = await listSwapsBetween(
		candidates.map((c) => c.staffId),
		from,
		to
	);
	// A department that already has its month's pattern (an earlier batch): the people of this file
	// join it (RI11) when it is one weekly pattern for the whole month; else the group is refused.
	const joined = new Map<
		string,
		{ patternId: string; mainShiftId: string; offWeekdays: number[] }
	>();
	for (const group of groups.values()) {
		const own =
			(group.kind === 'department'
				? roster?.departmentAssignments.filter((a) => a.departmentId === group.targetId)
				: roster?.teamAssignments.filter((a) => a.teamId === group.targetId)) ?? [];
		if (!own.some((a) => overlaps(a, from, next))) continue;
		const join = group.kind === 'department' ? joinableAssignment(own, from, next) : null;
		if (join) joined.set(group.key, join);
		else group.refused = 'group_has_roster';
	}
	const monthStart = startOfDamascusDay(from);
	const monthEnd = startOfDamascusDay(next);
	const accepted: Candidate[] = [];
	for (const c of candidates) {
		const reason = (() => {
			if (c.group.refused) return c.group.refused;
			if (!roster) return null;
			const mine = <T extends { staffId: string | null }>(rows: readonly T[]) =>
				rows.filter((r) => r.staffId === c.staffId);
			if (
				mine(roster.personalAssignments).some((a) => overlaps(a, from, next)) ||
				mine(roster.schedules).some((s) => overlaps(s, from, next)) ||
				mine(roster.overrides).length > 0 ||
				swaps.some((s) => s.staffId === c.staffId || s.otherStaffId === c.staffId)
			)
				return 'person_has_roster';
			const memberships = mine(roster.memberships).filter(
				(ms) => ms.validFrom < monthEnd && (ms.validTo === null || ms.validTo > monthStart)
			);
			if (c.group.kind === 'team' && !memberships.some((ms) => ms.teamId === c.group.targetId))
				return 'not_in_team';
			// A team pattern wins over a department one: such a person is planned by the team.
			if (
				c.group.kind === 'department' &&
				roster.teamAssignments.some(
					(a) => memberships.some((ms) => ms.teamId === a.teamId) && overlaps(a, from, next)
				)
			)
				return 'team_has_roster';
			return null;
		})();
		if (reason) refusedLines.set(c.line, reason);
		else accepted.push(c);
	}

	// ---- fit, name, replay ----
	// People without a department are grouped by team but planned person by person: a team pattern
	// would also reach team members a department plans (a team pattern comes first, RI10).
	const personalGroups = new Set(
		[...groups.values()].filter((g) => g.kind === 'team').map((g) => g.key)
	);
	const input: FitInput = {
		dates,
		people: accepted.map((c) => ({ staffId: c.staffId, teamId: c.group.key, cells: c.cells })),
		personalGroups,
		joined
	};
	const fits = fitTeams(input);
	const slotCodes = (slots: (string | null)[]) =>
		slots.map((id) => (id ? (codeOf.get(id) ?? '?') : OFF_CODE));
	const named = fits.map((fit) => {
		const group = groups.get(fit.teamId)!;
		const patternName = fit.mainShiftId && !fit.joined ? `${group.label}/${month}` : null;
		const personalNames = fit.personal.map(
			(p) =>
				`${group.label} ${codeOf.get(p.shiftId)} off ${p.offWeekdays.map((w) => WEEKDAYS[w]).join(' ') || 'none'}/${month}`
		);
		// The same weekly pattern saved under that name (an earlier batch of the month) is reused.
		const personalReuse = personalNames.map((name, i) => {
			const saved = patternsByName.get(name);
			return saved?.active &&
				saved.type === 'weekly' &&
				canonicalJson(saved.slots) === canonicalJson(fit.personal[i].slots)
				? saved.id
				: null;
		});
		if (
			(patternName !== null && patternsByName.has(patternName)) ||
			personalNames.some((n, i) => patternsByName.has(n) && personalReuse[i] === null)
		)
			group.refused = 'pattern_name_taken';
		return { ...fit, group, patternName, personalNames, personalReuse };
	});
	// A group refused for its names: its people are refused too, and it isn't saved.
	for (const fit of named)
		if (fit.group.refused)
			for (const c of accepted)
				if (c.group.key === fit.teamId) refusedLines.set(c.line, fit.group.refused);
	const kept = named.filter((f) => !f.group.refused);
	const keptKeys = new Set(kept.map((f) => f.teamId));
	const keptInput: FitInput = {
		dates,
		people: input.people.filter((p) => keptKeys.has(p.teamId)),
		personalGroups
	};
	const base = roster
		? { ...roster, absences: [] }
		: {
				shifts: [],
				memberships: [],
				personalAssignments: [],
				teamAssignments: [],
				departmentAssignments: [],
				departmentChains: {},
				schedules: [],
				overrides: [],
				absences: []
			};
	const mismatches = replayFit(keptInput, kept, base, undefined, (key) => {
		const g = groups.get(key)!;
		return g.kind === 'department'
			? { teamId: null, departmentId: g.targetId }
			: { teamId: g.targetId, departmentId: null };
	});

	// ---- unlisted members (planned by the group pattern too) ----
	const listed = new Set(read.lines.map((l) => byNo.get(l.employeeNo)?.staffId).filter(Boolean));
	const unlistedOf = new Map<string, string[]>();
	for (const fit of kept) {
		const g = fit.group;
		// A team group is planned person by person: nobody else in the team is reached. A joined
		// group (RI11) keeps its saved pattern: its other members' plan doesn't change.
		if (g.kind === 'team' || fit.joined) {
			unlistedOf.set(g.key, []);
			continue;
		}
		const members = (
			await listActiveStaffInDepartments([g.targetId, ...descendantIds(departments, g.targetId)])
		).map((p) => p.staffId);
		unlistedOf.set(
			g.key,
			[...new Set(members)].filter((id) => !listed.has(id))
		);
	}

	// ---- rows ----
	const rawOf = new Map(table.rows.map((r) => [r.rowNo, r.raw]));
	const lineOf = new Map(read.lines.map((l) => [l.line, l]));
	const fitOf = new Map(kept.map((f) => [f.teamId, f]));
	const rows: ImportRowDraft[] = [];
	const lines = [
		...new Set([...read.issues.map((i) => i.line), ...read.lines.map((l) => l.line)])
	].sort((a, b) => a - b);
	for (const line of lines) {
		const grid = lineOf.get(line);
		const group = lineGroup.get(line);
		const candidate =
			accepted.find((c) => c.line === line) ?? candidates.find((c) => c.line === line);
		const staffId = candidate?.staffId ?? null;
		const fit = group ? fitOf.get(group.key) : undefined;
		const personal =
			fit && staffId ? fit.personal.findIndex((p) => p.staffIds.includes(staffId)) : -1;
		const own = fit?.ownRules.find((r) => r.staffId === staffId);
		const parsed: RosterImportData | null = grid
			? {
					line: 'roster',
					employeeNo: grid.employeeNo,
					staffId,
					group: group?.label ?? (grid.department || grid.team),
					groupKey: group?.key ?? '',
					plannedDays: grid.codes.filter((c) => c !== '').length,
					ownOffWeekdays: own ? own.offWeekdays : null,
					personalPattern: personal >= 0 && fit ? fit.personalNames[personal] : null,
					swaps: fit?.swaps.filter((w) => w.staffId === staffId).length ?? 0,
					dayEdits: fit?.changes.filter((c) => c.staffId === staffId).length ?? 0,
					mismatches: mismatches.filter((x) => x.staffId === staffId).length
				}
			: null;
		const reason = refusedLines.get(line);
		rows.push({
			rowNo: line,
			raw: rawOf.get(line) ?? {},
			parsed,
			errors: reason ? [{ field: 'row', code: reason }] : [],
			action: reason ? 'skip' : 'create',
			targetId: staffId
		});
	}

	// ---- summary ----
	const groupSummaries: RosterGroupSummary[] = [...groups.values()].map((g) => {
		const fit = fitOf.get(g.key);
		const fitted = named.find((f) => f.teamId === g.key);
		const peopleIn = accepted.filter((c) => c.group.key === g.key).map((c) => c.staffId);
		return {
			key: g.key,
			label: g.label,
			kind: g.kind,
			targetId: g.targetId,
			people: fit ? peopleIn.length : 0,
			unlisted: unlistedOf.get(g.key)?.length ?? 0,
			patternName: fitted?.joined
				? (patternNameOf.get(joined.get(g.key)?.patternId ?? '') ?? null)
				: (fitted?.patternName ?? null),
			joined: fitted?.joined ?? false,
			slots: fitted?.mainShiftId ? slotCodes(fitted.slots) : [],
			ownRules: fit?.ownRules.length ?? 0,
			personal: (fitted?.personal ?? []).map((p, i) => ({
				name: fitted!.personalNames[i],
				slots: slotCodes(p.slots),
				people: p.staffIds.length
			})),
			swaps: fit?.swaps.length ?? 0,
			dayEdits: fit?.changes.length ?? 0,
			mismatches: mismatches.filter((x) => peopleIn.includes(x.staffId)).length,
			refused: g.refused
		};
	});
	const summary: RosterBatchSummary = {
		kind: 'roster',
		from,
		to,
		people: rows.filter((r) => r.action === 'create').length,
		groups: groupSummaries,
		patterns: kept.reduce(
			(n, f) =>
				n +
				(f.mainShiftId && !f.joined ? 1 : 0) +
				f.personalReuse.filter((id) => id === null).length,
			0
		),
		ownRules: kept.reduce((n, f) => n + f.ownRules.length, 0),
		swaps: kept.reduce((n, f) => n + f.swaps.length, 0),
		dayEdits: kept.reduce((n, f) => n + f.changes.length, 0),
		mismatches: mismatches.length,
		refused: tally([...refusedLines.values()])
	};
	const touched = [
		...new Set([...keptInput.people.map((p) => p.staffId), ...[...unlistedOf.values()].flat()])
	];
	return { rows, summary, build: { from, next, fits: kept, touched } };
}

/** What the save writes, as text: equal on preview and commit when nothing changed in between. */
function signature(
	rows: readonly { rowNo: number; action: string; parsed: unknown; errors: unknown }[]
) {
	// Keys sorted: the stored preview comes back from jsonb in another key order.
	return canonicalJson(rows.map((r) => [r.rowNo, r.action, r.parsed ?? null, r.errors ?? []]));
}

function tableOf(rows: readonly ImportRow[]): RawTable {
	const headers = [...new Set(rows.flatMap((r) => Object.keys(r.raw ?? {})))];
	return {
		headers,
		rows: rows.map((r) => ({
			rowNo: r.rowNo,
			values: headers.map((h) => r.raw?.[h] ?? ''),
			raw: r.raw ?? {}
		}))
	};
}

/**
 * Save the previewed roster: planned again on today's data and equal to the preview (else stale),
 * replay with 0 mismatches; patterns, assignments, own rules, day edits and approved self swaps in
 * one transaction with the batch id; the touched days recomputed.
 */
export async function commitRosterBatch(
	actor: Actor,
	batch: ImportBatch & { rows: ImportRow[] }
): Promise<{ patterns: number; people: number }> {
	requireActorPermission(actor, ROSTER_WRITE_PERMISSION);
	const plan = await planRosterFile(tableOf(batch.rows));
	const stored = [...batch.rows].sort((a, b) => a.rowNo - b.rowNo);
	if (signature(plan.rows) !== signature(stored))
		throw new ConflictError('import_stale', m.imports_error_stale());
	if (plan.summary.mismatches > 0)
		throw new ConflictError('roster_mismatch', m.imports_error_roster_mismatch());

	const { from, next, fits, touched } = plan.build;
	const reason = `Roster import ${batch.fileName}`;
	const by = actor.user.id;
	const now = new Date();
	const statements: [BatchQuery, ...BatchQuery[]] = [
		setImportBatchStatus(batch.id, 'previewed', { status: 'committed' })
	];
	const created = { patterns: [] as string[], assignments: 0, rules: 0, dayEdits: 0, swaps: 0 };
	const pattern = (name: string, slots: (string | null)[], defaultWorkShiftId: string | null) => {
		const id = randomUUID();
		const values = {
			id,
			nameEn: name,
			nameAr: name,
			type: 'weekly' as const,
			slots,
			defaultWorkShiftId,
			createdBy: by,
			importBatchId: batch.id
		};
		statements.push(
			insertPattern(values),
			auditInsert({
				actor: actor.user,
				action: 'pattern.create',
				entityType: 'pattern',
				entityId: id,
				after: values
			})
		);
		created.patterns.push(id);
		return id;
	};
	const assignment = (
		patternId: string,
		target: { staffId?: string; teamId?: string; departmentId?: string }
	) => {
		const values = {
			id: randomUUID(),
			patternId,
			staffId: target.staffId ?? null,
			teamId: target.teamId ?? null,
			departmentId: target.departmentId ?? null,
			anchorDate: null,
			effectiveFrom: from,
			effectiveTo: next,
			reason,
			createdBy: by,
			importBatchId: batch.id
		};
		statements.push(
			db.insert(patternAssignment).values(values),
			auditInsert({
				actor: actor.user,
				action: 'pattern_assignment.set',
				entityType: target.staffId ? 'staff' : target.teamId ? 'team' : 'department',
				entityId: target.staffId ?? target.teamId ?? target.departmentId ?? '',
				after: values,
				reason
			})
		);
		created.assignments++;
	};

	const schedules: (typeof staffSchedule.$inferInsert)[] = [];
	const overrides: (typeof rosterOverride.$inferInsert)[] = [];
	const swapRows: (typeof swapRequest.$inferInsert)[] = [];
	for (const fit of fits) {
		const g = fit.group;
		if (fit.mainShiftId && fit.patternName) {
			const id = pattern(fit.patternName, fit.slots, fit.mainShiftId);
			assignment(
				id,
				g.kind === 'department' ? { departmentId: g.targetId } : { teamId: g.targetId }
			);
		}
		fit.personal.forEach((p, i) => {
			const id = fit.personalReuse[i] ?? pattern(fit.personalNames[i], p.slots, p.shiftId);
			for (const staffId of p.staffIds) assignment(id, { staffId });
		});
		for (const rule of fit.ownRules)
			schedules.push({
				id: randomUUID(),
				staffId: rule.staffId,
				offWeekdays: rule.offWeekdays,
				crewStart: null,
				effectiveFrom: from,
				effectiveTo: next,
				reason,
				createdBy: by,
				importBatchId: batch.id
			});
		for (const c of fit.changes)
			overrides.push({
				id: randomUUID(),
				staffId: c.staffId,
				shiftDate: c.date,
				shiftId: c.shiftId,
				reason,
				createdBy: by,
				importBatchId: batch.id
			});
		for (const w of fit.swaps) {
			const swapId = randomUUID();
			swapRows.push({
				id: swapId,
				kind: 'self_swap',
				staffId: w.staffId,
				otherStaffId: null,
				firstDate: w.firstDate,
				secondDate: w.secondDate,
				shiftId: null,
				scope: w.scope,
				payAsOt: false,
				reason,
				state: 'approved',
				requestedBy: by,
				decidedBy: by,
				decidedAt: now,
				importBatchId: batch.id
			});
			for (const [shiftDate, shiftId] of [
				[w.firstDate, null],
				[w.secondDate, w.shiftId]
			] as const)
				overrides.push({
					id: randomUUID(),
					staffId: w.staffId,
					shiftDate,
					shiftId,
					reason,
					swapGroupId: swapId,
					createdBy: by,
					importBatchId: batch.id
				});
		}
	}
	created.rules = schedules.length;
	created.dayEdits = overrides.filter((o) => !o.swapGroupId).length;
	created.swaps = swapRows.length;
	if (schedules.length) statements.push(db.insert(staffSchedule).values(schedules));
	// Swap requests before their overrides (no FK, but readers expect the request).
	if (swapRows.length) statements.push(db.insert(swapRequest).values(swapRows));
	for (let i = 0; i < overrides.length; i += 500)
		statements.push(db.insert(rosterOverride).values(overrides.slice(i, i + 500)));
	statements.push(
		auditInsert({
			actor: actor.user,
			action: 'import.commit',
			entityType: 'import_batch',
			entityId: batch.id,
			after: {
				kind: batch.kind,
				from,
				to: addDays(next, -1),
				patterns: created.patterns.length,
				assignments: created.assignments,
				ownRules: created.rules,
				dayEdits: created.dayEdits,
				swaps: created.swaps,
				scheduleIds: schedules.map((s) => s.id),
				swapIds: swapRows.map((s) => s.id)
			}
		})
	);
	const last = addDays(next, -1);
	const today = todayInDamascus();
	const until = last < today ? last : today;
	if (from <= until) statements.push(...markNeedsRecompute(touched, from, until));
	await runBatch(statements);
	if (from <= until) await recomputeAfter(touched, from, until, causeBy(actor, 'roster_change'));
	return { patterns: created.patterns.length, people: plan.summary.people };
}

/**
 * Undo a roster batch (RI7): refused once a punch import was saved on its dates; else its day
 * edits and swaps are cancelled, its assignments and own rules removed, its patterns deactivated,
 * audited, and the people's days recomputed.
 */
export async function undoRosterBatch(actor: Actor, batch: ImportBatch): Promise<void> {
	requireActorPermission(actor, ROSTER_WRITE_PERMISSION);
	const summary = batch.summary as RosterBatchSummary | null;
	if (batch.status !== 'committed' || !summary)
		throw new ConflictError('not_undoable', m.imports_error_not_undoable());
	if (await hasCommittedPunchesBetween(summary.from, summary.to))
		throw new ConflictError('roster_has_punches', m.imports_error_roster_has_punches());

	const made = await listRosterBatchRows(batch.id);
	const departments = await listDepartmentRows();
	const monthStart = startOfDamascusDay(summary.from);
	const monthEnd = startOfDamascusDay(addDays(summary.to, 1));
	const groupPeople: string[] = [];
	for (const a of made.assignments) {
		if (a.staffId) groupPeople.push(a.staffId);
		else if (a.departmentId)
			groupPeople.push(
				...(
					await listActiveStaffInDepartments([
						a.departmentId,
						...descendantIds(departments, a.departmentId)
					])
				).map((p) => p.staffId)
			);
		else if (a.teamId)
			groupPeople.push(
				...(await listTeamMembersBetween(a.teamId, monthStart, monthEnd)).map((p) => p.staffId)
			);
	}
	const touched = [
		...new Set([
			...groupPeople,
			...made.schedules.map((s) => s.staffId),
			...made.overrides.map((o) => o.staffId),
			...made.swaps.map((s) => s.staffId)
		])
	];
	const at = new Date();
	const reason = m.imports_undo_reason();
	const today = todayInDamascus();
	const until = summary.to < today ? summary.to : today;
	await runBatch([
		setImportBatchStatus(batch.id, 'committed', {
			status: 'undone',
			undoneAt: at,
			undoneBy: actor.user.id,
			summary: {
				...summary,
				undone: {
					patterns: made.patterns.length,
					assignments: made.assignments.length,
					rules: made.schedules.length,
					dayEdits: made.overrides.length,
					swaps: made.swaps.length
				}
			}
		}),
		auditInsert({
			actor: actor.user,
			action: 'import.undo',
			entityType: 'import_batch',
			entityId: batch.id,
			// The rows before: what the undo removes or cancels.
			before: {
				patternIds: made.patterns.map((p) => p.id),
				assignmentIds: made.assignments.map((a) => a.id),
				scheduleIds: made.schedules.map((s) => s.id),
				overrideIds: made.overrides.map((o) => o.id),
				swapIds: made.swaps.map((s) => s.id)
			}
		}),
		...undoRosterStatements(batch.id, actor.user.id, at, reason),
		...(summary.from <= until ? markNeedsRecompute(touched, summary.from, until) : [])
	]);
	if (summary.from <= until)
		await recomputeAfter(touched, summary.from, until, causeBy(actor, 'roster_change'));
}
