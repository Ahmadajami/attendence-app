import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import {
	DAY_KINDS,
	DAY_STATUSES,
	LOG_CAUSES,
	LOG_FIELDS,
	LOG_SOURCES,
	ROSTER_SOURCES,
	SWAP_ROLES,
	UNPAID_REASONS
} from '#lib/schemas/enums.js';
import { absenceType, punchSource } from './attendance.js';
import { user } from './auth.js';
import { pattern, patternHoliday, shift, swapRequest } from './roster.js';
import { staff, team } from './workforce.js';

export const dayKind = pgEnum('day_kind', DAY_KINDS);
export const dayStatus = pgEnum('day_status', DAY_STATUSES);
export const rosterSource = pgEnum('roster_source', ROSTER_SOURCES);
export const unpaidReason = pgEnum('unpaid_reason', UNPAID_REASONS);
export const swapRole = pgEnum('swap_role', SWAP_ROLES);
export const logField = pgEnum('log_field', LOG_FIELDS);
export const logSource = pgEnum('log_source', LOG_SOURCES);
export const logCause = pgEnum('log_cause', LOG_CAUSES);

/**
 * One person's stored daily attendance for one shift date up to today (pay plan PR16, PR18; main
 * plan §7 `day_result`). **Derived**: recomputed from the roster, punches, absences, holidays and pay
 * rules whenever one of them changes (PR17), never edited by hand and not audited itself (the write
 * that caused it is). `inputs_hash` lets a recompute skip an unchanged day; `needs_recompute` is set
 * by a writer in its own transaction and cleared by the recompute. S4.1/S4.2 add the payroll
 * columns (Final, Deduction, tardiness) here.
 */
export const dayResult = pgTable(
	'day_result',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		shiftDate: date('shift_date', { mode: 'string' }).notNull(),
		kind: dayKind('kind').notNull(),
		status: dayStatus('status').notNull(),
		source: rosterSource('source').notNull(),
		patternId: uuid('pattern_id').references(() => pattern.id, { onDelete: 'restrict' }),
		/** The shift worked or rostered; `null` on an off day with no punches. */
		shiftId: uuid('shift_id').references(() => shift.id, { onDelete: 'restrict' }),
		teamId: uuid('team_id').references(() => team.id, { onDelete: 'restrict' }),
		holidayId: uuid('holiday_id').references(() => patternHoliday.id, { onDelete: 'restrict' }),
		absenceType: absenceType('absence_type'),
		checkIn: timestamp('check_in', { withTimezone: true }),
		checkOut: timestamp('check_out', { withTimezone: true }),
		/** Where the counted check-in came from (`manual` = typed, `import` = punch reading, `seed`). */
		checkInSource: punchSource('check_in_source'),
		checkOutSource: punchSource('check_out_source'),
		/** A counted time was corrected (PR24 "Corrected" badge). */
		corrected: boolean('corrected').notNull().default(false),
		requiredMinutes: integer('required_minutes').notNull().default(0),
		/** `null` until checked out. */
		workedMinutes: integer('worked_minutes'),
		lateMinutes: integer('late_minutes').notNull().default(0),
		/** Rounded to the quarter hour, before the pay rule. */
		overtimeMinutes: integer('overtime_minutes').notNull().default(0),
		/** The rate the paid overtime earns; `null` when nothing is paid. */
		otRate: numeric('ot_rate', { precision: 4, scale: 2, mode: 'number' }),
		paidOtMinutes: integer('paid_ot_minutes').notNull().default(0),
		unpaidExtraMinutes: integer('unpaid_extra_minutes').notNull().default(0),
		unpaidReason: unpaidReason('unpaid_reason'),
		/** The approved swap that moved this day (PR27), and what it made of it. */
		swapRequestId: uuid('swap_request_id').references(() => swapRequest.id, {
			onDelete: 'restrict'
		}),
		swapRole: swapRole('swap_role'),
		/** Worked a planned off day without an approved swap (R12: shown, not penalised). */
		unauthSwap: boolean('unauth_swap').notNull().default(false),
		/** Ids, rule sources and steps only: never names or absence reasons. */
		explanation: jsonb('explanation').$type<Record<string, unknown>>().notNull().default({}),
		inputsHash: text('inputs_hash').notNull(),
		needsRecompute: boolean('needs_recompute').notNull().default(false),
		computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('day_result_staff_date_unique').on(t.staffId, t.shiftDate),
		index('day_result_date_idx').on(t.shiftDate),
		index('day_result_recompute_idx')
			.on(t.shiftDate)
			.where(sql`${t.needsRecompute}`),
		check(
			'day_result_minutes',
			sql`${t.requiredMinutes} >= 0 AND (${t.workedMinutes} IS NULL OR ${t.workedMinutes} >= 0) AND ${t.lateMinutes} >= 0 AND ${t.overtimeMinutes} >= 0 AND ${t.paidOtMinutes} >= 0 AND ${t.unpaidExtraMinutes} >= 0`
		),
		check(
			'day_result_swap',
			sql`(${t.swapRequestId} IS NULL) = (${t.swapRole} IS NULL) AND NOT (${t.unauthSwap} AND ${t.swapRequestId} IS NOT NULL)`
		),
		check('day_result_rate_range', sql`${t.otRate} IS NULL OR ${t.otRate} BETWEEN 1 AND 5`)
	]
);

export const dayResultRelations = relations(dayResult, ({ one }) => ({
	staff: one(staff, { fields: [dayResult.staffId], references: [staff.id] }),
	pattern: one(pattern, { fields: [dayResult.patternId], references: [pattern.id] }),
	shift: one(shift, { fields: [dayResult.shiftId], references: [shift.id] }),
	team: one(team, { fields: [dayResult.teamId], references: [team.id] }),
	holiday: one(patternHoliday, { fields: [dayResult.holidayId], references: [patternHoliday.id] }),
	swapRequest: one(swapRequest, {
		fields: [dayResult.swapRequestId],
		references: [swapRequest.id]
	})
}));

/**
 * The attendance edit log (pay plan PR22–PR24): one line per changed value of a person-day, written
 * by the recompute in the same batch as the `day_result` row (old → new, the source and the record
 * that caused it). **Append-only**: a custom migration refuses UPDATE and DELETE. Values are
 * figures, times, ids and enum keys only; absence reasons are never copied (health data).
 */
export const attendanceLog = pgTable(
	'attendance_log',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		shiftDate: date('shift_date', { mode: 'string' }).notNull(),
		field: logField('field').notNull(),
		/** `null`: no value before (or after). */
		oldValue: jsonb('old_value').$type<string | number | boolean | null>(),
		newValue: jsonb('new_value').$type<string | number | boolean | null>(),
		source: logSource('source').notNull(),
		causeType: logCause('cause_type').notNull(),
		/** The row in the table `cause_type` names; `null` with `none`. */
		causeId: uuid('cause_id'),
		/** `null`: the system (backfill, catch-up). */
		actorId: uuid('actor_id').references(() => user.id, { onDelete: 'set null' }),
		at: timestamp('at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('attendance_log_day_idx').on(t.staffId, t.shiftDate, t.at),
		index('attendance_log_at_idx').on(t.at),
		check('attendance_log_cause', sql`(${t.causeType} = 'none') = (${t.causeId} IS NULL)`)
	]
);

export const attendanceLogRelations = relations(attendanceLog, ({ one }) => ({
	staff: one(staff, { fields: [attendanceLog.staffId], references: [staff.id] }),
	actor: one(user, { fields: [attendanceLog.actorId], references: [user.id] })
}));

export type DayResult = typeof dayResult.$inferSelect;
export type NewDayResult = typeof dayResult.$inferInsert;
export type AttendanceLog = typeof attendanceLog.$inferSelect;
export type NewAttendanceLog = typeof attendanceLog.$inferInsert;
