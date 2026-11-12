import { randomUUID } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { batch as runBatch, db } from '#lib/server/db/index.js';
import {
	ConflictError,
	ForbiddenError,
	InvalidInputError,
	NotFoundError
} from '#lib/server/errors.js';
import { auditLog, importBatch, importRow, staff } from '#lib/server/db/schema/index.js';
import { buildStaffRows } from '#lib/server/imports/staff-import.js';
import { parseUpload, type RawTable } from '#lib/server/imports/parse.js';
import type { ImportIssue, ImportRowDraft, PunchImportData } from '#lib/types/imports.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from './common.js';
import { membershipChange } from './membership.js';
import {
	PUNCH_UPLOAD_LIMITS,
	PUNCH_WRITE_PERMISSION,
	commitPunchBatch,
	planPunchFile,
	undoPunchBatch
} from './punch-import/punch-import.bl.js';
import { listPeopleNames } from './roster/roster.crud.js';

export const IMPORT_KINDS = ['staff', 'punches'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/**
 * `import.run` lets someone upload; what an import writes also needs that domain's write
 * permission, so `import.run` alone never changes staff or punches.
 */
const WRITE_PERMISSION = { staff: 'staff.write', punches: PUNCH_WRITE_PERMISSION } as const;

/** Rows per insert statement when a preview is stored. */
const ROW_CHUNK = 1_000;

function requireImportRun(actor: Actor) {
	if (!actor.permissions.has('import.run')) throw new ForbiddenError();
}

const batchIdSchema = z.uuid();

/** A batch id from the URL. Anything that isn't a uuid can't exist, so it is a 404, not a DB error. */
function requireBatchId(id: string): string {
	if (!batchIdSchema.safeParse(id).success) throw new NotFoundError(m.imports_error_not_found());
	return id;
}

function isKind(value: string): value is ImportKind {
	return (IMPORT_KINDS as readonly string[]).includes(value);
}

function hasErrors(value: ImportIssue[] | null): boolean {
	return (value?.length ?? 0) > 0;
}

function counts(rows: ImportRowDraft[]) {
	return {
		totalRows: rows.length,
		createCount: rows.filter((row) => row.action === 'create').length,
		updateCount: rows.filter((row) => row.action === 'update').length,
		skipCount: rows.filter((row) => row.action === 'skip' && row.errors.length === 0).length,
		errorCount: rows.filter((row) => row.errors.length > 0).length
	};
}

async function buildRows(kind: ImportKind, table: RawTable) {
	if (kind === 'punches') {
		const plan = await planPunchFile(table, new Date());
		return { rows: plan.rows, summary: plan.summary };
	}
	return { rows: await buildStaffRows(table), summary: null };
}

/** Recent uploads, newest first. */
export async function listImportBatches(actor: Actor) {
	requireImportRun(actor);
	return db.query.importBatch.findMany({
		orderBy: [desc(importBatch.createdAt)],
		limit: 20,
		with: { createdByUser: { columns: { fullName: true, fullNameAr: true } } }
	});
}

export async function getImportBatch(actor: Actor, id: string) {
	requireImportRun(actor);
	const batch = await db.query.importBatch.findFirst({
		where: eq(importBatch.id, requireBatchId(id)),
		with: {
			rows: true,
			createdByUser: { columns: { fullName: true, fullNameAr: true } }
		}
	});
	if (!batch) throw new NotFoundError(m.imports_error_not_found());
	return {
		...batch,
		rows: [...batch.rows].sort((a, b) => a.rowNo - b.rowNo)
	};
}

/**
 * Parse the upload, resolve lookups, write the preview batch and its rows in one transaction.
 * Nothing operational changes until `commitImport`.
 */
export async function previewImport(actor: Actor, kind: string, file: File) {
	requireImportRun(actor);
	if (!isKind(kind)) throw new InvalidInputError('invalid_kind', m.imports_error_invalid_kind());
	requireActorPermission(actor, WRITE_PERMISSION[kind]);

	const table: RawTable = await parseUpload(
		file,
		kind === 'punches' ? PUNCH_UPLOAD_LIMITS : undefined
	);

	const { rows, summary: kindSummary } = await buildRows(kind, table);
	const summary = counts(rows);
	const id = randomUUID();
	const fileName = file.name.slice(0, 200) || 'import';

	const rowValues = rows.map((row) => ({
		batchId: id,
		rowNo: row.rowNo,
		raw: row.raw,
		parsed: row.parsed,
		errors: row.errors,
		action: row.action,
		targetId: row.targetId
	}));

	const rowInserts: BatchQuery[] = [];
	for (let i = 0; i < rowValues.length; i += ROW_CHUNK)
		rowInserts.push(db.insert(importRow).values(rowValues.slice(i, i + ROW_CHUNK)));

	await runBatch([
		db.insert(importBatch).values({
			id,
			kind,
			fileName,
			createdBy: actor.user.id,
			summary: kindSummary,
			...summary
		}),
		...rowInserts,
		auditInsert({
			actor: actor.user,
			action: 'import.preview',
			entityType: 'import_batch',
			entityId: id,
			after: { kind, fileName, ...summary }
		})
	]);

	return { id, ...summary };
}

async function commitStaff(
	actor: Actor,
	rows: (typeof importRow.$inferSelect)[],
	statements: BatchQuery[]
) {
	const updates = rows.filter((row) => row.action === 'update' && row.targetId);
	const targetIds = updates.map((row) => row.targetId as string);
	const existing =
		targetIds.length > 0
			? await db
					.select({
						id: staff.id,
						employeeNo: staff.employeeNo,
						fullName: staff.fullName,
						fullNameAr: staff.fullNameAr,
						phone: staff.phone,
						functionId: staff.functionId,
						teamId: staff.teamId
					})
					.from(staff)
					.where(inArray(staff.id, targetIds))
			: [];
	const existingById = new Map(existing.map((row) => [row.id, row]));
	const auditRows: (typeof auditLog.$inferInsert)[] = [];
	const at = new Date();

	for (const row of rows) {
		const data = row.parsed;
		if (!data || !('fullName' in data) || hasErrors(row.errors)) continue;
		if (row.action !== 'create' && row.action !== 'update') continue;
		const values = {
			employeeNo: data.employeeNo,
			fullName: data.fullName,
			fullNameAr: data.fullNameAr,
			phone: data.phone,
			functionId: data.functionId,
			teamId: data.teamId
		};

		if (row.action === 'create') {
			const id = randomUUID();
			statements.push(
				db.insert(staff).values({ id, ...values }),
				...membershipChange(id, null, values.teamId, at)
			);
			auditRows.push({
				actorUserId: actor.user.id,
				action: 'staff.import_create',
				entityType: 'staff',
				entityId: id,
				after: values
			});
		} else if (row.targetId) {
			statements.push(
				db.update(staff).set(values).where(eq(staff.id, row.targetId)),
				...membershipChange(
					row.targetId,
					existingById.get(row.targetId)?.teamId ?? null,
					values.teamId,
					at
				)
			);
			auditRows.push({
				actorUserId: actor.user.id,
				action: 'staff.import_update',
				entityType: 'staff',
				entityId: row.targetId,
				before: existingById.get(row.targetId) ?? null,
				after: values
			});
		}
	}

	if (auditRows.length > 0) statements.push(db.insert(auditLog).values(auditRows));
}

/** Apply every create / update row, mark the batch committed and audit it in one transaction. */
export async function commitImport(actor: Actor, batchId: string) {
	requireImportRun(actor);
	requireBatchId(batchId);
	const batch = await db.query.importBatch.findFirst({
		where: eq(importBatch.id, batchId),
		with: { rows: true }
	});
	if (!batch) throw new NotFoundError(m.imports_error_not_found());
	if (batch.status !== 'previewed') {
		throw new ConflictError('already_committed', m.imports_error_already_committed());
	}

	const rows = batch.rows;
	requireActorPermission(actor, WRITE_PERMISSION[batch.kind]);
	if (batch.kind === 'punches') {
		const written = await commitPunchBatch(actor, batch);
		return { kind: 'punches' as const, ...written };
	}
	const statements: [BatchQuery, ...BatchQuery[]] = [
		db.update(importBatch).set({ status: 'committed' }).where(eq(importBatch.id, batchId)),
		db.insert(auditLog).values({
			actorUserId: actor.user.id,
			action: 'import.commit',
			entityType: 'import_batch',
			entityId: batchId,
			after: {
				kind: batch.kind,
				createCount: batch.createCount,
				updateCount: batch.updateCount
			}
		})
	];

	await commitStaff(actor, rows, statements);

	try {
		await runBatch(statements);
	} catch (error) {
		const code = pgErrorCode(error);
		if (code === '23P01' || code === '23505') {
			throw new ConflictError('conflict', m.imports_error_conflict(), { cause: error });
		}
		throw error;
	}

	return {
		kind: 'staff' as const,
		created: batch.createCount,
		updated: batch.updateCount,
		skipped: batch.skipCount,
		errors: batch.errorCount
	};
}

/** A batch's kind, so its page can pick the staff view or the paged punch view. */
export async function getImportBatchKind(actor: Actor, id: string): Promise<ImportKind> {
	requireImportRun(actor);
	const [row] = await db
		.select({ kind: importBatch.kind })
		.from(importBatch)
		.where(eq(importBatch.id, requireBatchId(id)))
		.limit(1);
	if (!row) throw new NotFoundError(m.imports_error_not_found());
	return row.kind;
}

/** Undo a committed punch batch (its events voided, its absences cancelled). */
export async function undoImport(actor: Actor, batchId: string) {
	requireImportRun(actor);
	requireBatchId(batchId);
	const batch = await db.query.importBatch.findFirst({ where: eq(importBatch.id, batchId) });
	if (!batch) throw new NotFoundError(m.imports_error_not_found());
	await undoPunchBatch(actor, batch);
}

/** Which lines of a punch batch to show. */
export const PUNCH_FILTERS = ['all', 'import', 'warning', 'state', 'skipped', 'refused'] as const;
export type PunchFilter = (typeof PUNCH_FILTERS)[number];

export const PUNCH_PAGE_SIZE = 100;

function matches(filter: PunchFilter, row: typeof importRow.$inferSelect): boolean {
	const data = row.parsed as PunchImportData | null;
	const refused = (row.errors?.length ?? 0) > 0;
	switch (filter) {
		case 'import':
			return row.action === 'create';
		case 'warning':
			return row.action === 'create' && (data?.warnings.length ?? 0) > 0;
		case 'state':
			return data?.line === 'state';
		case 'skipped':
			return row.action === 'skip' && !refused;
		case 'refused':
			return refused;
		default:
			return true;
	}
}

/**
 * A punch batch with one page of its lines (a month is thousands): filtered, with each line's
 * person name and planned shift code. The state kind is left out (health data, IM6).
 */
export async function getPunchBatchPage(
	actor: Actor,
	id: string,
	filter: PunchFilter,
	page: number,
	employeeNo: string
) {
	requireImportRun(actor);
	const batch = await db.query.importBatch.findFirst({
		where: eq(importBatch.id, requireBatchId(id)),
		with: {
			rows: true,
			createdByUser: { columns: { fullName: true, fullNameAr: true } },
			undoneByUser: { columns: { fullName: true, fullNameAr: true } }
		}
	});
	if (!batch || batch.kind !== 'punches') throw new NotFoundError(m.imports_error_not_found());
	const { rows: allRows, ...rest } = batch;
	const wanted = employeeNo.trim();
	const rows = allRows
		.filter((r) => matches(filter, r))
		.filter((r) => !wanted || (r.parsed as PunchImportData | null)?.employeeNo === wanted)
		.sort((a, b) => a.rowNo - b.rowNo);
	const pages = Math.max(1, Math.ceil(rows.length / PUNCH_PAGE_SIZE));
	const current = Math.min(Math.max(1, page), pages);
	const slice = rows.slice((current - 1) * PUNCH_PAGE_SIZE, current * PUNCH_PAGE_SIZE);
	const staffIds = [
		...new Set(slice.map((r) => (r.parsed as PunchImportData | null)?.staffId).filter((x) => !!x))
	] as string[];
	const names = new Map((await listPeopleNames(staffIds)).map((p) => [p.staffId, p]));
	return {
		batch: rest,
		filter,
		employee: wanted,
		page: current,
		pages,
		matching: rows.length,
		lines: slice.map((r) => {
			const data = r.parsed as PunchImportData | null;
			const person = data?.staffId ? names.get(data.staffId) : undefined;
			return {
				id: r.id,
				rowNo: r.rowNo,
				action: r.action,
				errors: r.errors ?? [],
				person: person ? { fullName: person.fullName, fullNameAr: person.fullNameAr } : null,
				employeeNo: data?.employeeNo ?? r.raw?.['Employee No'] ?? '',
				date: data?.date ?? '',
				line: data?.line ?? null,
				checkIn: data?.checkIn ?? null,
				checkOut: data?.checkOut ?? null,
				plannedShiftCode: data?.plannedShiftCode ?? null,
				dayOff: data?.line === 'punch' && data.staffId !== null && data.plannedShiftId === null,
				skipReason: data?.skipReason ?? null,
				warnings: data?.warnings ?? []
			};
		})
	};
}
