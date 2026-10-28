import { relations, sql } from 'drizzle-orm';
import {
	check,
	date,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { ABSENCE_TYPES, ATTENDANCE_EVENT_TYPES } from '#lib/schemas/enums.js';
import { user } from './auth.js';
import { shiftKind } from './roster.js';
import { staff, team } from './workforce.js';

export const attendanceEventType = pgEnum('attendance_event_type', ATTENDANCE_EVENT_TYPES);

export const absenceType = pgEnum('absence_type', ABSENCE_TYPES);

/**
 * **Append-only** (CLAUDE.md §7): a check-in, check-out, break start or break end. `shift_date`,
 * `shift_kind` and `team_id` record the shift it was counted for when it was recorded, so reports
 * never move when cycles or teams change later. A mistake is fixed by a new event that points at
 * the wrong one (`corrects_event_id`) with a `reason`; the original stays.
 */
export const attendanceEvent = pgTable(
	'attendance_event',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		type: attendanceEventType('type').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
		shiftDate: date('shift_date', { mode: 'string' }).notNull(),
		shiftKind: shiftKind('shift_kind').notNull(),
		/** The person's team on the shift date; `null` when they had none. */
		teamId: uuid('team_id').references(() => team.id, { onDelete: 'restrict' }),
		recordedBy: uuid('recorded_by').references(() => user.id, { onDelete: 'set null' }),
		note: text('note'),
		correctsEventId: uuid('corrects_event_id').references((): AnyPgColumn => attendanceEvent.id, {
			onDelete: 'restrict'
		}),
		/** Required on a correction and on an unscheduled check-in (enforced by the service). */
		reason: text('reason'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('attendance_event_staff_idx').on(t.staffId, t.occurredAt),
		index('attendance_event_team_date_idx').on(t.teamId, t.shiftDate),
		index('attendance_event_date_idx').on(t.shiftDate),
		index('attendance_event_corrects_idx').on(t.correctsEventId),
		check('attendance_event_worked_kind', sql`${t.shiftKind} <> 'off'`),
		check(
			'attendance_event_correction_reason',
			sql`${t.correctsEventId} IS NULL OR length(trim(coalesce(${t.reason}, ''))) > 0`
		)
	]
);

/**
 * A person is away for whole Damascus dates, `starts_on` to `ends_on` inclusive (rosters are
 * day-granular). Cancelled, never deleted. A custom migration keeps one person's active absences
 * from overlapping.
 */
export const absence = pgTable(
	'absence',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		startsOn: date('starts_on', { mode: 'string' }).notNull(),
		endsOn: date('ends_on', { mode: 'string' }).notNull(),
		type: absenceType('type').notNull(),
		reason: text('reason'),
		recordedBy: uuid('recorded_by').references(() => user.id, { onDelete: 'set null' }),
		cancelledBy: uuid('cancelled_by').references(() => user.id, { onDelete: 'set null' }),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('absence_staff_idx').on(t.staffId, t.startsOn),
		index('absence_dates_idx').on(t.startsOn, t.endsOn),
		check('absence_date_order', sql`${t.endsOn} >= ${t.startsOn}`)
	]
);

export const attendanceEventRelations = relations(attendanceEvent, ({ one }) => ({
	staff: one(staff, { fields: [attendanceEvent.staffId], references: [staff.id] }),
	team: one(team, { fields: [attendanceEvent.teamId], references: [team.id] }),
	corrects: one(attendanceEvent, {
		fields: [attendanceEvent.correctsEventId],
		references: [attendanceEvent.id]
	})
}));

export const absenceRelations = relations(absence, ({ one }) => ({
	staff: one(staff, { fields: [absence.staffId], references: [staff.id] })
}));

export type AttendanceEvent = typeof attendanceEvent.$inferSelect;
export type NewAttendanceEvent = typeof attendanceEvent.$inferInsert;
export type Absence = typeof absence.$inferSelect;
export type NewAbsence = typeof absence.$inferInsert;
