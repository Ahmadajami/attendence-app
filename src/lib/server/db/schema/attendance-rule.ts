import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { RoundingMode } from '#lib/roster/overtime.js';
import { user } from './auth.js';

// The attendance rules that vary by date (OC7, EN1, EN2): one company version per row, each with
// its dates. A day takes the version in force on its shift date; with none, the built-in defaults
// in `#lib/roster/attendance-rules.ts` (Odoo's values). Changes are audited in the same batch.
export const attendanceRule = pgTable(
	'attendance_rule',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Overtime rounding step in minutes; `0` = none. */
		overtimeStep: integer('overtime_step').notNull(),
		overtimeMode: text('overtime_mode').$type<RoundingMode>().notNull(),
		fridayPrayerOn: boolean('friday_prayer_on').notNull(),
		fridayPrayerMinutes: integer('friday_prayer_minutes').notNull(),
		fridayPrayerSegments: integer('friday_prayer_segments').notNull(),
		effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
		/** Exclusive; `null` while the version is open. */
		effectiveTo: date('effective_to', { mode: 'string' }),
		reason: text('reason').notNull(),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('attendance_rule_from_unique').on(t.effectiveFrom),
		index('attendance_rule_to_idx').on(t.effectiveTo),
		check('attendance_rule_step', sql`${t.overtimeStep} IN (0, 5, 10, 15, 30)`),
		check('attendance_rule_mode', sql`${t.overtimeMode} IN ('nearest', 'up', 'down')`),
		check(
			'attendance_rule_prayer_minutes',
			sql`${t.fridayPrayerMinutes} BETWEEN 0 AND 240 AND ${t.fridayPrayerSegments} BETWEEN 1 AND 10`
		),
		check('attendance_rule_reason_present', sql`length(trim(${t.reason})) > 0`),
		check(
			'attendance_rule_effective_order',
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`
		)
	]
);

export type AttendanceRuleRow = typeof attendanceRule.$inferSelect;
