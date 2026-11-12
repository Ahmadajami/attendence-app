import { and, asc, eq, getTableColumns, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DayResultValues } from '#lib/attendance/day-result.js';
import type { LogLine, StoredDay } from '#lib/attendance/recompute.js';
import { db } from '#lib/server/db/index.js';
import { attendanceEvent, attendanceLog, dayResult, staff } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// The stored daily attendance and its edit log (pay plan PR16–PR23). Writes return unexecuted
// queries for `batch([...])`.

/** Rows per statement: keeps each INSERT well under PostgreSQL's parameter limit. */
export const WRITE_CHUNK = 500;

function chunks<T>(items: readonly T[], size = WRITE_CHUNK): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

type DayResultRow = typeof dayResult.$inferSelect;

/** A stored row as the pure code sees it. */
export function toValues(row: DayResultRow): DayResultValues {
	return {
		staffId: row.staffId,
		shiftDate: row.shiftDate,
		kind: row.kind,
		status: row.status,
		source: row.source,
		patternId: row.patternId,
		shiftId: row.shiftId,
		teamId: row.teamId,
		holidayId: row.holidayId,
		absenceType: row.absenceType,
		checkIn: row.checkIn?.toISOString() ?? null,
		checkOut: row.checkOut?.toISOString() ?? null,
		checkInSource: row.checkInSource,
		checkOutSource: row.checkOutSource,
		corrected: row.corrected,
		requiredMinutes: row.requiredMinutes,
		workedMinutes: row.workedMinutes,
		creditMinutes: row.creditMinutes,
		shortageMinutes: row.shortageMinutes,
		creditExtraMinutes: row.creditExtraMinutes,
		lateMinutes: row.lateMinutes,
		overtimeMinutes: row.overtimeMinutes,
		otRate: row.otRate,
		paidOtMinutes: row.paidOtMinutes,
		unpaidExtraMinutes: row.unpaidExtraMinutes,
		unpaidReason: row.unpaidReason,
		swapRequestId: row.swapRequestId,
		swapRole: row.swapRole,
		unauthSwap: row.unauthSwap,
		explanation: row.explanation
	};
}

/** The stored rows of these people on shift dates `[from, to]`, as the planner sees them. */
export async function listStoredDays(
	staffIds: readonly string[],
	from: string,
	to: string
): Promise<StoredDay[]> {
	if (staffIds.length === 0) return [];
	const rows = await db
		.select()
		.from(dayResult)
		.where(
			and(
				inArray(dayResult.staffId, [...staffIds]),
				gte(dayResult.shiftDate, from),
				lte(dayResult.shiftDate, to)
			)
		);
	return rows.map((row) => ({
		values: toValues(row),
		hash: row.inputsHash,
		needsRecompute: row.needsRecompute
	}));
}

// Every computed column is replaced on conflict; the id stays.
const KEEP = new Set(['id', 'staffId', 'shiftDate']);
const UPDATE_SET = Object.fromEntries(
	Object.entries(getTableColumns(dayResult))
		.filter(([key]) => !KEEP.has(key))
		.map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)])
);

/** Insert or replace these rows (one statement per chunk), clearing their recompute flag. */
export function upsertDayResults(
	rows: readonly { values: DayResultValues; hash: string }[]
): BatchQuery[] {
	const now = new Date();
	return chunks(rows).map((slice) =>
		db
			.insert(dayResult)
			.values(
				slice.map(({ values, hash }) => ({
					...values,
					checkIn: values.checkIn ? new Date(values.checkIn) : null,
					checkOut: values.checkOut ? new Date(values.checkOut) : null,
					inputsHash: hash,
					needsRecompute: false,
					computedAt: now
				}))
			)
			.onConflictDoUpdate({ target: [dayResult.staffId, dayResult.shiftDate], set: UPDATE_SET })
	);
}

/** The edit-log lines (append-only; never updated or deleted). */
export function insertLogLines(lines: readonly LogLine[]): BatchQuery[] {
	return chunks(lines).map((slice) =>
		db.insert(attendanceLog).values(
			slice.map((line) => ({
				staffId: line.staffId,
				shiftDate: line.shiftDate,
				field: line.field,
				oldValue: line.oldValue,
				newValue: line.newValue,
				source: line.source,
				causeType: line.causeType,
				causeId: line.causeId,
				actorId: line.actorId
			}))
		)
	);
}

/**
 * Flag the stored rows of these people on shift dates `[from, to]` (PR17): put it in the writer's
 * own batch, so a failed recompute afterwards is caught up later. Rows not stored yet are created
 * by the recompute or the next catch-up.
 */
export function markNeedsRecompute(
	staffIds: readonly string[],
	from: string,
	to: string
): BatchQuery[] {
	if (staffIds.length === 0 || from > to) return [];
	return [
		db
			.update(dayResult)
			.set({ needsRecompute: true })
			.where(
				and(
					inArray(dayResult.staffId, [...new Set(staffIds)]),
					gte(dayResult.shiftDate, from),
					lte(dayResult.shiftDate, to)
				)
			)
	];
}

/**
 * Flagged rows, oldest first. The condition is the bare column, exactly the predicate of the
 * partial index `day_result_recompute_idx`: `needs_recompute = $1` cannot use that index once
 * PostgreSQL plans the prepared statement without its parameter.
 */
export async function listFlaggedDays(limit: number) {
	return db
		.select({ staffId: dayResult.staffId, shiftDate: dayResult.shiftDate })
		.from(dayResult)
		.where(sql`${dayResult.needsRecompute}`)
		.orderBy(asc(dayResult.shiftDate))
		.limit(limit);
}

/** Active people, and anyone with an event on shift dates `[from, to]` (for the backfill). */
export async function listStaffToRecompute(from: string, to: string): Promise<string[]> {
	const [active, punched] = await Promise.all([
		db.select({ id: staff.id }).from(staff).where(eq(staff.active, true)),
		db
			.selectDistinct({ id: attendanceEvent.staffId })
			.from(attendanceEvent)
			.where(and(gte(attendanceEvent.shiftDate, from), lte(attendanceEvent.shiftDate, to)))
	]);
	return [...new Set([...active, ...punched].map((r) => r.id))];
}
