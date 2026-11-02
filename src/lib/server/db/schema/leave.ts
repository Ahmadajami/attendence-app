import { relations, sql } from 'drizzle-orm';
import {
	check,
	numeric,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { staff } from './workforce.js';

/**
 * A person's leave for one calendar year (pay plan PR30–PR32): the yearly days HR grants and the
 * days carried from the year before (negative when last year went below zero). Days taken and left
 * are computed from `leave` absences on planned work days, never stored. One row per person and
 * year; changed in place, every change audited (CLAUDE.md §6.3).
 */
export const leaveEntitlement = pgTable(
	'leave_entitlement',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		year: smallint('year').notNull(),
		days: numeric('days', { precision: 5, scale: 2, mode: 'number' }).notNull(),
		carriedDays: numeric('carried_days', { precision: 5, scale: 2, mode: 'number' })
			.notNull()
			.default(0),
		reason: text('reason').notNull(),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		updatedBy: uuid('updated_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('leave_entitlement_staff_year_unique').on(t.staffId, t.year),
		check('leave_entitlement_year_range', sql`${t.year} BETWEEN 2000 AND 2100`),
		check(
			'leave_entitlement_days_range',
			sql`${t.days} BETWEEN 0 AND 365 AND ${t.carriedDays} BETWEEN -365 AND 365`
		),
		check('leave_entitlement_reason_present', sql`length(trim(${t.reason})) > 0`)
	]
);

export const leaveEntitlementRelations = relations(leaveEntitlement, ({ one }) => ({
	staff: one(staff, { fields: [leaveEntitlement.staffId], references: [staff.id] })
}));

export type LeaveEntitlement = typeof leaveEntitlement.$inferSelect;
export type NewLeaveEntitlement = typeof leaveEntitlement.$inferInsert;
