import { sql } from 'drizzle-orm';
import {
	check,
	date,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/**
 * The company's off-day leave-conversion override from a date (TP32): the minutes one off-day leave
 * debit converts to for every employee. A `NULL` `minutes` version means "no override from this
 * date" — the employee's normal workday required minutes apply. Versions are dated like
 * `attendance_rule`: `effective_to` is exclusive, a change closes the open version, and no row is
 * ever deleted. A custom migration adds an `EXCLUDE` so versions never overlap.
 */
export const offDayLeaveConversion = pgTable(
	'off_day_leave_conversion',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Company override in minutes; `NULL`: use the employee's normal workday minutes. */
		minutes: numeric('minutes', { mode: 'number' }),
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
		uniqueIndex('off_day_leave_conversion_from_unique').on(t.effectiveFrom),
		// Unscaled `numeric` also stores NaN/±Infinity, and PostgreSQL orders NaN above Infinity,
		// so `> 0` alone would accept all three. `> 0 AND < Infinity` keeps finite positives only.
		check(
			'off_day_leave_conversion_minutes_positive',
			sql`${t.minutes} IS NULL OR (${t.minutes} > 0 AND ${t.minutes} < 'Infinity'::numeric)`
		),
		check('off_day_leave_conversion_reason_present', sql`length(trim(${t.reason})) > 0`),
		check(
			'off_day_leave_conversion_effective_order',
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`
		)
	]
);

export type OffDayLeaveConversion = typeof offDayLeaveConversion.$inferSelect;
export type NewOffDayLeaveConversion = typeof offDayLeaveConversion.$inferInsert;
