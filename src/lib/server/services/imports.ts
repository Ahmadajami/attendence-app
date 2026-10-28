import { randomUUID } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { db } from '#lib/server/db/index.js';
import {
	ConflictError,
	ForbiddenError,
	InvalidInputError,
	NotFoundError
} from '#lib/server/errors.js';
import {
	auditLog,
	flight,
	importBatch,
	importRow,
	staff,
	teamFlightAssignment
} from '#lib/server/db/schema/index.js';
import { buildFlightRows } from '#lib/server/imports/flight-import.js';
import { buildStaffRows } from '#lib/server/imports/staff-import.js';
import { parseUpload, type RawTable } from '#lib/server/imports/parse.js';
import type { ImportIssue, ImportRowDraft } from '#lib/types/imports.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from './common.js';
import { membershipChange } from './membership.js';

export type ImportKind = 'staff' | 'flights';

/**
 * `import.run` lets someone upload; what an import writes also needs that domain's write
 * permission, so `import.run` alone never changes staff, flights or assignments.
 */
const WRITE_PERMISSION = { staff: 'staff.write', flights: 'flight.write' } as const;

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
	return value === 'staff' || value === 'flights';
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
	return kind === 'staff' ? buildStaffRows(table) : buildFlightRows(table);
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

	const table: RawTable = await parseUpload(file);

	const rows = await buildRows(kind, table);
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

	await db.batch([
		db.insert(importBatch).values({ id, kind, fileName, createdBy: actor.user.id, ...summary }),
		...(rowValues.length > 0 ? [db.insert(importRow).values(rowValues)] : []),
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
		if (!data || !('employeeNo' in data) || hasErrors(row.errors)) continue;
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

async function commitFlights(
	actor: Actor,
	rows: (typeof importRow.$inferSelect)[],
	statements: BatchQuery[]
) {
	const updates = rows.filter((row) => row.action === 'update' && row.targetId);
	const targetIds = updates.map((row) => row.targetId as string);
	const [existingFlights, assignments] = await Promise.all([
		targetIds.length > 0
			? db
					.select({
						id: flight.id,
						airlineCode: flight.airlineCode,
						flightNo: flight.flightNo,
						direction: flight.direction,
						origin: flight.origin,
						destination: flight.destination,
						scheduledAt: flight.scheduledAt,
						aircraftType: flight.aircraftType,
						stand: flight.stand,
						gate: flight.gate,
						imageUrl: flight.imageUrl,
						handlingStartsAt: flight.handlingStartsAt,
						handlingEndsAt: flight.handlingEndsAt
					})
					.from(flight)
					.where(inArray(flight.id, targetIds))
			: [],
		targetIds.length > 0
			? db
					.select()
					.from(teamFlightAssignment)
					.where(inArray(teamFlightAssignment.flightId, targetIds))
			: []
	]);
	const existingById = new Map(existingFlights.map((row) => [row.id, row]));
	const assignmentByFlight = new Map(
		assignments.filter((row) => row.status === 'assigned').map((row) => [row.flightId, row])
	);
	const auditRows: (typeof auditLog.$inferInsert)[] = [];

	for (const row of rows) {
		const data = row.parsed;
		if (!data || !('flightNo' in data) || hasErrors(row.errors)) continue;
		if (row.action !== 'create' && row.action !== 'update') continue;
		const flightId = row.action === 'create' ? randomUUID() : row.targetId;
		if (!flightId) continue;

		const values = {
			airlineCode: data.airlineCode,
			flightNo: data.flightNo,
			direction: data.direction,
			origin: data.origin,
			destination: data.destination,
			scheduledAt: new Date(data.scheduledAt),
			aircraftType: data.aircraftType,
			stand: data.stand,
			gate: data.gate,
			imageUrl: data.imageUrl,
			handlingStartsAt: new Date(data.handlingStartsAt),
			handlingEndsAt: new Date(data.handlingEndsAt)
		};

		if (row.action === 'create') {
			statements.push(
				db.insert(flight).values({
					id: flightId,
					...values,
					status: 'scheduled',
					source: 'import',
					externalRef: data.externalRef
				})
			);
			auditRows.push({
				actorUserId: actor.user.id,
				action: 'flight.import_create',
				entityType: 'flight',
				entityId: flightId,
				after: { ...values, status: 'scheduled', externalRef: data.externalRef }
			});
		} else {
			statements.push(db.update(flight).set(values).where(eq(flight.id, flightId)));
			auditRows.push({
				actorUserId: actor.user.id,
				action: 'flight.import_update',
				entityType: 'flight',
				entityId: flightId,
				before: existingById.get(flightId) ?? null,
				after: values
			});
		}

		const current = assignmentByFlight.get(flightId);
		const startsAt = new Date(data.handlingStartsAt);
		const endsAt = new Date(data.handlingEndsAt);

		// Same team (or none named): the active assignment follows the flight's window, so the
		// overlap constraint always checks the real times (CLAUDE.md §6.2), as `updateFlight` does.
		if (!data.teamId || data.teamId === current?.teamId) {
			if (
				current &&
				(current.startsAt.getTime() !== startsAt.getTime() ||
					current.endsAt.getTime() !== endsAt.getTime())
			) {
				statements.push(
					db
						.update(teamFlightAssignment)
						.set({ startsAt, endsAt })
						.where(eq(teamFlightAssignment.id, current.id))
				);
				auditRows.push({
					actorUserId: actor.user.id,
					action: 'assignment.import_move',
					entityType: 'team_flight_assignment',
					entityId: current.id,
					before: { startsAt: current.startsAt, endsAt: current.endsAt },
					after: { startsAt, endsAt }
				});
			}
			continue;
		}

		if (current) {
			statements.push(
				db
					.update(teamFlightAssignment)
					.set({ status: 'cancelled' })
					.where(eq(teamFlightAssignment.id, current.id))
			);
			auditRows.push({
				actorUserId: actor.user.id,
				action: 'assignment.import_cancel',
				entityType: 'team_flight_assignment',
				entityId: current.id,
				before: { teamId: current.teamId, status: current.status },
				after: { status: 'cancelled' }
			});
		}

		const assignmentId = randomUUID();
		statements.push(
			db.insert(teamFlightAssignment).values({
				id: assignmentId,
				teamId: data.teamId,
				flightId,
				startsAt,
				endsAt,
				assignedBy: actor.user.id
			})
		);
		auditRows.push({
			actorUserId: actor.user.id,
			action: 'assignment.import_assign',
			entityType: 'team_flight_assignment',
			entityId: assignmentId,
			after: { teamId: data.teamId, flightId, startsAt, endsAt }
		});
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
	const assignsTeams = rows.some(
		(row) => row.parsed && 'flightNo' in row.parsed && row.parsed.teamId !== null
	);
	if (assignsTeams) requireActorPermission(actor, 'assignment.write');
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

	if (batch.kind === 'staff') await commitStaff(actor, rows, statements);
	else await commitFlights(actor, rows, statements);

	try {
		await db.batch(statements);
	} catch (error) {
		const code = pgErrorCode(error);
		if (code === '23P01' || code === '23505') {
			throw new ConflictError('conflict', m.imports_error_conflict(), { cause: error });
		}
		throw error;
	}

	return {
		created: batch.createCount,
		updated: batch.updateCount,
		skipped: batch.skipCount,
		errors: batch.errorCount
	};
}
