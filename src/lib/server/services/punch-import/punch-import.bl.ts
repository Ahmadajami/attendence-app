// The in-app punch import (plan 2026-11-11-attendance-import-odoo-and-devices, IM3, IM6, IM12):
// one file of punch parts and full-day states → a preview where every line has one outcome
// (import, skipped, refused) → commit as one batch (events and absences carry the batch id) →
// undo (void corrections and cancelled absences). Every write is audited and recomputed.
import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import {
	MissingHeaderError,
	planPunchImport,
	planStateImport,
	readPunchFile,
	stateRanges,
	type ImportEvent,
	type ScopeDay
} from '#lib/attendance/punch-import.js';
import { addDays, daysBetween } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import { rosterDay, type RosterDay } from '#lib/roster/roster.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch as runBatch } from '#lib/server/db/index.js';
import type { ImportBatch, ImportRow } from '#lib/server/db/schema/index.js';
import { ConflictError, InvalidInputError } from '#lib/server/errors.js';
import type { RawTable } from '#lib/server/imports/parse.js';
import type {
	ImportIssue,
	ImportRowDraft,
	PunchBatchSummary,
	PunchImportData
} from '#lib/types/imports.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { causeBy, markNeedsRecompute, recomputeAfter } from '../day-results/day-results.bl.js';
import { insertAbsences, insertEvents, listEventsBetween } from '../attendance/attendance.crud.js';
import { loadRosterData } from '../roster/roster.bl.js';
import {
	cancelAbsences,
	listActiveBatchAbsences,
	listBatchEvents,
	listCorrectionsOf,
	listStaffByEmployeeNo,
	setBatchCommitted,
	setBatchUndone
} from './punch-import.crud.js';

/** What writing a punch import needs besides `import.run` (Q-IM7: the same right as typing). */
export const PUNCH_WRITE_PERMISSION = 'attendance.record' as const;

/** A month of every team fits; a longer file is split by month. */
export const MAX_PUNCH_FILE_DAYS = 62;

/** Upload caps for a punch file (a month of ~300 people is ~5 000 lines). */
export const PUNCH_UPLOAD_LIMITS = { maxBytes: 4 * 1024 * 1024, maxRows: 20_000 };

/** Inserted rows per statement. */
const CHUNK = 500;

const SOURCE = 'import' as const;

/** The planned shift of a stored roster day (as the entry sheet reads it). */
function plannedShift(day: RosterDay) {
	return day.shift && day.start ? day.shift : null;
}

const tally = (items: readonly string[]) => {
	const counts: Record<string, number> = {};
	for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
	return counts;
};

type EventInsert = ImportEvent & { line: number };

/** The file's plan against today's data: the preview rows, their counts and what commit writes. */
export type PunchFilePlan = {
	rows: ImportRowDraft[];
	summary: PunchBatchSummary;
	events: EventInsert[];
	ranges: ReturnType<typeof stateRanges>;
};

/**
 * Read the uploaded table and decide every line: the person by employee number (active only), the
 * roster's planned day from the live roster, the people's stored events (reruns, duplicates,
 * overlaps) and their absences.
 */
export async function planPunchFile(table: RawTable, now: Date): Promise<PunchFilePlan> {
	let read: ReturnType<typeof readPunchFile>;
	try {
		read = readPunchFile(table);
	} catch (error) {
		if (error instanceof MissingHeaderError)
			throw new InvalidInputError(
				'punch_header',
				m.imports_error_punch_header({ header: error.header }),
				{ cause: error }
			);
		throw error;
	}

	const dates = [...read.rows.map((r) => r.date), ...read.states.map((s) => s.date)].sort();
	const from = dates[0] ?? null;
	const to = dates.at(-1) ?? null;
	if (from && to && daysBetween(from, to) + 1 > MAX_PUNCH_FILE_DAYS)
		throw new InvalidInputError(
			'punch_range',
			m.imports_error_punch_range({ days: MAX_PUNCH_FILE_DAYS })
		);

	const matched = await listStaffByEmployeeNo([
		...read.rows.map((r) => r.employeeNo),
		...read.states.map((s) => s.employeeNo)
	]);
	const byNo = new Map(matched.map((p) => [p.employeeNo, p]));
	const active = matched.filter((p) => p.active);
	const people = new Map(active.map((p) => [p.employeeNo, p.staffId]));
	/** A person the file names but the app can't take: unknown, or archived. */
	const outOfScope = (employeeNo: string) =>
		byNo.has(employeeNo) ? 'inactive_person' : 'unknown_person';

	const days = new Map<string, ScopeDay>();
	const absentDays = new Set<string>();
	const planned = new Map<string, RosterDay>();
	let existing: Awaited<ReturnType<typeof listEventsBetween>> = [];
	if (from && to && active.length > 0) {
		const ids = active.map((p) => p.staffId);
		const [roster, events] = await Promise.all([
			loadRosterData(active, from, daysBetween(from, to) + 1),
			// A pair is at most 16 h: the neighbouring dates are enough for reruns and overlaps.
			listEventsBetween(ids, addDays(from, -2), addDays(to, 2))
		]);
		existing = events;
		for (const person of active) {
			const input = rosterInputOf(roster, person.staffId);
			for (let date = from; date <= to; date = addDays(date, 1)) {
				const day = rosterDay(input, date);
				const key = `${person.staffId} ${date}`;
				planned.set(key, day);
				if (day.source === 'absence') absentDays.add(key);
				days.set(key, {
					staffId: person.staffId,
					date,
					teamId: day.teamId,
					shift: plannedShift(day),
					source: day.source,
					swapRole: day.swapRole
				});
			}
		}
	}

	const punchPlan = planPunchImport({
		rows: read.rows,
		people,
		days,
		existing,
		from: from ?? '',
		to: to ?? '',
		now,
		reason: null,
		source: SOURCE
	});
	const statePlan = planStateImport({
		states: read.states,
		people,
		absentDays,
		punchDays: new Set(punchPlan.pairs.map((p) => `${p.staffId} ${p.shiftDate}`)),
		from: from ?? '',
		to: to ?? ''
	});

	// ---- one draft per line ----
	const rawOf = new Map(table.rows.map((r) => [r.rowNo, r.raw]));
	const drafts = new Map<number, ImportRowDraft>();
	const refuse = (line: number, code: string, parsed: PunchImportData | null) =>
		drafts.set(line, {
			rowNo: line,
			raw: rawOf.get(line) ?? {},
			parsed,
			errors: [{ field: 'row', code } satisfies ImportIssue],
			action: 'skip',
			targetId: null
		});
	const base = (
		line: 'punch' | 'state',
		row: { employeeNo: string; date: string }
	): PunchImportData => {
		const staffId = people.get(row.employeeNo) ?? null;
		const day = staffId ? planned.get(`${staffId} ${row.date}`) : undefined;
		const shift = day ? plannedShift(day) : null;
		return {
			line,
			employeeNo: row.employeeNo,
			staffId,
			date: row.date,
			checkIn: null,
			checkOut: null,
			state: null,
			plannedShiftId: shift?.id ?? null,
			plannedShiftCode: shift?.code ?? null,
			skipReason: null,
			warnings: [],
			events: []
		};
	};

	for (const issue of read.issues) refuse(issue.line, issue.issue, null);

	const punchRow = new Map(read.rows.map((r) => [r.line, r]));
	const punchData = (line: number): PunchImportData => {
		const row = punchRow.get(line)!;
		return { ...base('punch', row), checkIn: row.checkIn, checkOut: row.checkOut };
	};
	for (const pair of punchPlan.pairs)
		drafts.set(pair.line, {
			rowNo: pair.line,
			raw: rawOf.get(pair.line) ?? {},
			parsed: {
				...punchData(pair.line),
				warnings: [...pair.warnings],
				events: pair.events.map((e) => ({ type: e.type, at: e.occurredAt.toISOString() }))
			},
			errors: [],
			action: 'create',
			targetId: null
		});
	for (const skip of punchPlan.skipped)
		drafts.set(skip.line, {
			rowNo: skip.line,
			raw: rawOf.get(skip.line) ?? {},
			parsed: { ...punchData(skip.line), skipReason: skip.reason },
			errors: [],
			action: 'skip',
			targetId: null
		});
	for (const r of punchPlan.rejected) {
		const row = punchRow.get(r.line)!;
		refuse(
			r.line,
			r.reason === 'not_in_scope' ? outOfScope(row.employeeNo) : r.reason,
			punchData(r.line)
		);
	}

	const stateRow = new Map(read.states.map((s) => [s.line, s]));
	const stateData = (line: number): PunchImportData => {
		const row = stateRow.get(line)!;
		return { ...base('state', row), state: row.state };
	};
	for (const s of statePlan.accepted)
		drafts.set(s.line, {
			rowNo: s.line,
			raw: rawOf.get(s.line) ?? {},
			parsed: { ...stateData(s.line), warnings: s.withPunches ? ['state_with_punches'] : [] },
			errors: [],
			action: 'create',
			targetId: null
		});
	for (const skip of statePlan.skipped)
		drafts.set(skip.line, {
			rowNo: skip.line,
			raw: rawOf.get(skip.line) ?? {},
			parsed: { ...stateData(skip.line), skipReason: skip.reason },
			errors: [],
			action: 'skip',
			targetId: null
		});
	for (const r of statePlan.rejected) {
		const row = stateRow.get(r.line)!;
		refuse(
			r.line,
			r.reason === 'not_in_scope' ? outOfScope(row.employeeNo) : r.reason,
			stateData(r.line)
		);
	}

	const rows = [...drafts.values()].sort((a, b) => a.rowNo - b.rowNo);
	const events: EventInsert[] = punchPlan.pairs.flatMap((p) =>
		p.events.map((e) => ({ ...e, line: p.line }))
	);
	const ranges = stateRanges(statePlan.accepted);
	const imported = rows.filter((r) => r.action === 'create');
	const summary: PunchBatchSummary = {
		from,
		to,
		lines: rows.length + read.empty,
		empty: read.empty,
		people: new Set(
			imported.map((r) => (r.parsed && 'staffId' in r.parsed ? r.parsed.staffId : null))
		).size,
		pairs: punchPlan.pairs.length,
		events: events.length,
		states: statePlan.accepted.length,
		absences: ranges.length,
		dayOff: punchPlan.pairs.filter((p) => p.plannedShiftId === null).length,
		warned: imported.filter((r) => r.parsed && 'warnings' in r.parsed && r.parsed.warnings.length)
			.length,
		skipped: tally(
			rows
				.filter((r) => r.action === 'skip' && r.errors.length === 0)
				.map((r) => (r.parsed && 'skipReason' in r.parsed ? (r.parsed.skipReason ?? '') : ''))
		),
		refused: tally(rows.flatMap((r) => r.errors.map((e) => e.code))),
		warnings: tally(
			imported.flatMap((r) => (r.parsed && 'warnings' in r.parsed ? r.parsed.warnings : []))
		)
	};
	return { rows, summary, events, ranges };
}

/** What a line inserts, as text: equal on preview and commit when nothing changed in between. */
function signature(rows: readonly { rowNo: number; action: string; parsed: unknown }[]): string {
	return rows
		.filter((r) => r.action === 'create')
		.map((r) => {
			const data = r.parsed as PunchImportData;
			return `${r.rowNo}:${data.staffId}:${data.state ?? ''}:${data.events.map((e) => `${e.type}@${e.at}`).join(',')}`;
		})
		.sort()
		.join('|');
}

/** The table again from the stored rows (their raw cells), to re-plan on commit. */
function tableOf(rows: readonly ImportRow[]): RawTable {
	const headers = [...new Set(rows.flatMap((r) => Object.keys(r.raw ?? {})))];
	return {
		headers,
		rows: rows.map((r) => {
			const values = headers.map((h) => r.raw?.[h] ?? '');
			return { rowNo: r.rowNo, values, raw: r.raw ?? {} };
		})
	};
}

/**
 * Write the previewed batch: the file is planned again on today's data and must give the same
 * inserts as the preview (else the preview is stale). Events (source `import`) and absences carry
 * the batch id; one transaction with the audit row; then the touched days are recomputed.
 */
export async function commitPunchBatch(
	actor: Actor,
	batch: ImportBatch & { rows: ImportRow[] }
): Promise<{ events: number; absences: number }> {
	requireActorPermission(actor, PUNCH_WRITE_PERMISSION);
	const plan = await planPunchFile(tableOf(batch.rows), new Date());
	if (signature(plan.rows) !== signature(batch.rows))
		throw new ConflictError('import_stale', m.imports_error_stale());

	const events = plan.events.map((e) => ({
		id: randomUUID(),
		staffId: e.staffId,
		type: e.type,
		occurredAt: e.occurredAt,
		shiftDate: e.shiftDate,
		teamId: e.teamId,
		recordedBy: actor.user.id,
		source: SOURCE,
		reason: e.reason,
		importBatchId: batch.id
	}));
	const absences = plan.ranges.map((r) => ({
		id: randomUUID(),
		staffId: r.staffId,
		startsOn: r.startsOn,
		endsOn: r.endsOn,
		type: r.state,
		reason: null,
		recordedBy: actor.user.id,
		importBatchId: batch.id
	}));
	const touched = [...new Set([...events, ...absences].map((r) => r.staffId))];
	const { from, to } = plan.summary;

	const statements: [BatchQuery, ...BatchQuery[]] = [
		setBatchCommitted(batch.id),
		auditInsert({
			actor: actor.user,
			action: 'import.commit',
			entityType: 'import_batch',
			entityId: batch.id,
			// Ids and counts only: a state may be health data.
			after: {
				kind: batch.kind,
				from,
				to,
				people: touched.length,
				events: events.length,
				absences: absences.length
			}
		})
	];
	for (let i = 0; i < events.length; i += CHUNK)
		statements.push(...insertEvents(events.slice(i, i + CHUNK)));
	for (let i = 0; i < absences.length; i += CHUNK)
		statements.push(...insertAbsences(absences.slice(i, i + CHUNK)));
	if (from && to) statements.push(...markNeedsRecompute(touched, from, to));

	try {
		await runBatch(statements);
	} catch (error) {
		if (pgErrorCode(error) === '23P01')
			throw new ConflictError('absence_overlap', m.attendance_error_absence_overlap(), {
				cause: error
			});
		throw error;
	}
	if (from && to && touched.length > 0)
		await recomputeAfter(touched, from, to, causeBy(actor, 'punch_reading'));
	return { events: events.length, absences: absences.length };
}

/**
 * Undo a committed punch batch: a void correction for each of its events still in effect, its
 * absences cancelled, the batch marked undone, audited, and the days recomputed. Refused when
 * someone corrected one of its punches since (that correction would be left pointing at a voided
 * event): fix those by hand first.
 */
export async function undoPunchBatch(actor: Actor, batch: ImportBatch): Promise<void> {
	requireActorPermission(actor, PUNCH_WRITE_PERMISSION);
	if (batch.kind !== 'punches' || batch.status !== 'committed')
		throw new ConflictError('not_undoable', m.imports_error_not_undoable());

	const [events, absences] = await Promise.all([
		listBatchEvents(batch.id),
		listActiveBatchAbsences(batch.id)
	]);
	const corrections = await listCorrectionsOf(events.map((e) => e.id));
	if (corrections.some((c) => !c.isVoid))
		throw new ConflictError('import_corrected', m.imports_error_import_corrected());
	const voided = new Set(corrections.map((c) => c.correctsEventId));
	const live = events.filter((e) => !voided.has(e.id));

	const at = new Date();
	const reason = m.imports_undo_reason();
	const voids = live.map((e) => ({
		id: randomUUID(),
		staffId: e.staffId,
		type: e.type,
		occurredAt: e.occurredAt,
		shiftDate: e.shiftDate,
		teamId: e.teamId,
		recordedBy: actor.user.id,
		source: SOURCE,
		correctsEventId: e.id,
		isVoid: true,
		reason
	}));
	const touched = [...new Set([...live, ...absences].map((r) => r.staffId))];
	const summary = batch.summary;
	const from = summary?.from ?? null;
	const to = summary?.to ?? null;

	const statements: [BatchQuery, ...BatchQuery[]] = [
		setBatchUndone(batch.id, actor.user.id, at, {
			...(summary as PunchBatchSummary),
			undone: { events: live.length, absences: absences.length }
		}),
		auditInsert({
			actor: actor.user,
			action: 'import.undo',
			entityType: 'import_batch',
			entityId: batch.id,
			after: {
				voidedEvents: live.length,
				cancelledAbsences: absences.length,
				people: touched.length
			}
		})
	];
	for (let i = 0; i < voids.length; i += CHUNK)
		statements.push(...insertEvents(voids.slice(i, i + CHUNK)));
	statements.push(
		...cancelAbsences(
			absences.map((a) => a.id),
			actor.user.id,
			at
		)
	);
	if (from && to) statements.push(...markNeedsRecompute(touched, from, to));
	await runBatch(statements);
	if (from && to && touched.length > 0)
		await recomputeAfter(touched, from, to, causeBy(actor, 'punch_reading'));
}
