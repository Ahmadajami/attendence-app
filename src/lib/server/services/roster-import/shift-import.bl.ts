// The shifts import (plan 2026-11-12-roster-import, RI2, RI7): a file of shifts → a preview where
// each line creates a shift, is already in the app (same code and times), or is refused → save as
// one batch → undo deactivates the batch's shifts while nothing uses them.
import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import { MissingColumnError, readShiftFile } from '#lib/roster/roster-file.js';
import { parseClock } from '#lib/payroll/schedule.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch as runBatch } from '#lib/server/db/index.js';
import type { ImportBatch, ImportRow } from '#lib/server/db/schema/index.js';
import { ConflictError, InvalidInputError } from '#lib/server/errors.js';
import type { RawTable } from '#lib/server/imports/parse.js';
import type { ImportRowDraft, ShiftBatchSummary, ShiftImportData } from '#lib/types/imports.js';
import { requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { insertShift, isShiftUsed, listShiftRows } from '../shifts/shifts.crud.js';
import { deactivateShifts, listBatchShifts, setImportBatchStatus } from './roster-import.crud.js';

export const ROSTER_WRITE_PERMISSION = 'roster.manage' as const;

const tally = (items: readonly string[]) => {
	const counts: Record<string, number> = {};
	for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
	return counts;
};

/** Each line against the app's shifts. */
export async function planShiftFile(
	table: RawTable
): Promise<{ rows: ImportRowDraft[]; summary: ShiftBatchSummary }> {
	let read: ReturnType<typeof readShiftFile>;
	try {
		read = readShiftFile(table);
	} catch (error) {
		if (error instanceof MissingColumnError)
			throw new InvalidInputError(
				'file_header',
				m.imports_error_punch_header({ header: error.header }),
				{ cause: error }
			);
		throw error;
	}
	const existing = new Map((await listShiftRows()).map((s) => [s.code, s]));
	const rawOf = new Map(table.rows.map((r) => [r.rowNo, r.raw]));
	const rows: ImportRowDraft[] = [];

	for (const issue of read.issues)
		rows.push({
			rowNo: issue.line,
			raw: rawOf.get(issue.line) ?? {},
			parsed: null,
			errors: [{ field: issue.field, code: issue.code }],
			action: 'skip',
			targetId: null
		});
	for (const { line, shift } of read.lines) {
		const data: ShiftImportData = { line: 'shift', ...shift, skipReason: null };
		const found = existing.get(shift.code);
		const same =
			found &&
			parseClock(found.startTime) === parseClock(shift.startTime) &&
			parseClock(found.endTime) === parseClock(shift.endTime) &&
			found.breakMinutes === shift.breakMinutes &&
			found.requiredMinutes === shift.requiredMinutes;
		rows.push({
			rowNo: line,
			raw: rawOf.get(line) ?? {},
			parsed: same ? { ...data, skipReason: 'same_as_app' } : data,
			errors: found && !same ? [{ field: 'code', code: 'code_taken' }] : [],
			action: found ? 'skip' : 'create',
			targetId: found?.id ?? null
		});
	}
	rows.sort((a, b) => a.rowNo - b.rowNo);
	return {
		rows,
		summary: {
			kind: 'shifts',
			create: rows.filter((r) => r.action === 'create').length,
			same: rows.filter((r) => r.action === 'skip' && r.errors.length === 0).length,
			refused: tally(rows.flatMap((r) => r.errors.map((e) => e.code)))
		}
	};
}

/** Create the previewed shifts (the app's shifts must still not have those codes). */
export async function commitShiftBatch(
	actor: Actor,
	batch: ImportBatch & { rows: ImportRow[] }
): Promise<{ created: number }> {
	requireActorPermission(actor, ROSTER_WRITE_PERMISSION);
	const taken = new Set((await listShiftRows()).map((s) => s.code));
	const creates = batch.rows.filter((r) => r.action === 'create' && r.parsed);
	if (creates.some((r) => taken.has((r.parsed as ShiftImportData).code)))
		throw new ConflictError('import_stale', m.imports_error_stale());

	const statements: [BatchQuery, ...BatchQuery[]] = [
		setImportBatchStatus(batch.id, 'previewed', { status: 'committed' }),
		auditInsert({
			actor: actor.user,
			action: 'import.commit',
			entityType: 'import_batch',
			entityId: batch.id,
			after: { kind: batch.kind, shifts: creates.length }
		})
	];
	for (const row of creates) {
		const data = row.parsed as ShiftImportData;
		const input = {
			code: data.code,
			nameEn: data.nameEn,
			nameAr: data.nameAr,
			colour: data.colour,
			startTime: data.startTime,
			endTime: data.endTime,
			breakMinutes: data.breakMinutes,
			requiredMinutes: data.requiredMinutes
		};
		const id = randomUUID();
		statements.push(
			insertShift({
				id,
				...input,
				colour: input.colour as Parameters<typeof insertShift>[0]['colour'],
				createdBy: actor.user.id,
				importBatchId: batch.id
			}),
			auditInsert({
				actor: actor.user,
				action: 'shift.create',
				entityType: 'shift',
				entityId: id,
				after: input
			})
		);
	}
	await runBatch(statements);
	return { created: creates.length };
}

/** Deactivate the batch's shifts; refused while a pattern, day edit or swap uses one of them. */
export async function undoShiftBatch(actor: Actor, batch: ImportBatch): Promise<void> {
	requireActorPermission(actor, ROSTER_WRITE_PERMISSION);
	if (batch.status !== 'committed')
		throw new ConflictError('not_undoable', m.imports_error_not_undoable());
	const shifts = await listBatchShifts(batch.id);
	for (const s of shifts)
		if (await isShiftUsed(s.id))
			throw new ConflictError('shift_used', m.imports_error_shift_used({ code: s.code }));
	const at = new Date();
	await runBatch([
		setImportBatchStatus(batch.id, 'committed', {
			status: 'undone',
			undoneAt: at,
			undoneBy: actor.user.id,
			summary: { ...(batch.summary as ShiftBatchSummary), deactivated: shifts.length }
		}),
		auditInsert({
			actor: actor.user,
			action: 'import.undo',
			entityType: 'import_batch',
			entityId: batch.id,
			after: { kind: batch.kind, deactivated: shifts.length }
		}),
		...deactivateShifts(shifts.map((s) => s.id))
	]);
}
