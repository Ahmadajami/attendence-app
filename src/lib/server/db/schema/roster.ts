import { relations, sql } from 'drizzle-orm';
import {
	check,
	date,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { SHIFT_KINDS } from '#lib/schemas/enums.js';
import { user } from './auth.js';
import { staff, team } from './workforce.js';

export const shiftKind = pgEnum('shift_kind', SHIFT_KINDS);

/**
 * One version of a repeating shift cycle (ROSTER_PLAN.md). It belongs to a team, or to one person
 * (a personal cycle wins over the team's on its dates). Cycle day 1 is `anchor_date`; the cycle
 * repeats before and after it. Dates and times are Damascus wall-clock rules, not instants; each
 * shift is 12 h from its start. Versions are never edited: a change closes the current one
 * (`effective_to`) and opens the next. A custom migration adds one `EXCLUDE` per owner so versions
 * of one team, or of one person, never overlap.
 */
export const shiftPattern = pgTable(
	'shift_pattern',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		teamId: uuid('team_id').references(() => team.id, { onDelete: 'restrict' }),
		staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'restrict' }),
		cycle: shiftKind('cycle').array().notNull(),
		anchorDate: date('anchor_date', { mode: 'string' }).notNull(),
		/** Copied from `app_setting` `roster.shift_starts` when the version is saved. */
		dayStart: time('day_start').notNull(),
		nightStart: time('night_start').notNull(),
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
		index('shift_pattern_team_idx').on(t.teamId, t.effectiveFrom),
		index('shift_pattern_staff_idx').on(t.staffId, t.effectiveFrom),
		check('shift_pattern_one_owner', sql`num_nonnulls(${t.teamId}, ${t.staffId}) = 1`),
		check(
			'shift_pattern_cycle_shape',
			sql`array_ndims(${t.cycle}) = 1 AND cardinality(${t.cycle}) BETWEEN 1 AND 28 AND array_position(${t.cycle}, NULL) IS NULL`
		),
		check('shift_pattern_cycle_works', sql`${t.cycle} && ARRAY['day', 'night']::shift_kind[]`),
		check(
			'shift_pattern_effective_order',
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`
		)
	]
);

/** Who supervises a team. Information only until supervisor accounts (ROSTER_PLAN.md, Later). */
export const teamSupervisor = pgTable(
	'team_supervisor',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		teamId: uuid('team_id')
			.notNull()
			.references(() => team.id, { onDelete: 'restrict' }),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		addedBy: uuid('added_by').references(() => user.id, { onDelete: 'set null' }),
		addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
		removedBy: uuid('removed_by').references(() => user.id, { onDelete: 'set null' }),
		/** `null` while the person supervises the team. */
		removedAt: timestamp('removed_at', { withTimezone: true }),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('team_supervisor_active_unique')
			.on(t.teamId, t.staffId)
			.where(sql`${t.removedAt} IS NULL`),
		index('team_supervisor_staff_idx').on(t.staffId),
		check(
			'team_supervisor_removed_order',
			sql`${t.removedAt} IS NULL OR ${t.removedAt} >= ${t.addedAt}`
		)
	]
);

/**
 * A one-off Day / Night / Off for one person on one shift date, with a reason. A Day or Night on a
 * rostered off day that isn't part of a swap is an extra shift (all of it is overtime). The
 * overrides of one swap share `swap_group_id`, are created in one batch and cancelled together.
 * Cancelled, never deleted.
 */
export const rosterOverride = pgTable(
	'roster_override',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		shiftDate: date('shift_date', { mode: 'string' }).notNull(),
		kind: shiftKind('kind').notNull(),
		reason: text('reason').notNull(),
		swapGroupId: uuid('swap_group_id'),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		cancelledBy: uuid('cancelled_by').references(() => user.id, { onDelete: 'set null' }),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('roster_override_active_unique')
			.on(t.staffId, t.shiftDate)
			.where(sql`${t.cancelledAt} IS NULL`),
		index('roster_override_date_idx').on(t.shiftDate),
		index('roster_override_swap_idx').on(t.swapGroupId),
		check('roster_override_reason_present', sql`length(trim(${t.reason})) > 0`)
	]
);

/**
 * An admin's approval of one person's overtime on one shift date (`overtime.approve`). `minutes` is
 * what was approved (rounded to 15 min); when later corrections change the computed overtime, the
 * day shows "changed since approval". Revoked, never deleted.
 */
export const overtimeApproval = pgTable(
	'overtime_approval',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		shiftDate: date('shift_date', { mode: 'string' }).notNull(),
		shiftKind: shiftKind('shift_kind').notNull(),
		minutes: integer('minutes').notNull(),
		approvedBy: uuid('approved_by').references(() => user.id, { onDelete: 'set null' }),
		approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
		revokedBy: uuid('revoked_by').references(() => user.id, { onDelete: 'set null' }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('overtime_approval_active_unique')
			.on(t.staffId, t.shiftDate)
			.where(sql`${t.revokedAt} IS NULL`),
		index('overtime_approval_date_idx').on(t.shiftDate),
		check('overtime_approval_minutes', sql`${t.minutes} > 0 AND ${t.minutes} % 15 = 0`),
		check('overtime_approval_worked_kind', sql`${t.shiftKind} <> 'off'`)
	]
);

export const shiftPatternRelations = relations(shiftPattern, ({ one }) => ({
	team: one(team, { fields: [shiftPattern.teamId], references: [team.id] }),
	staff: one(staff, { fields: [shiftPattern.staffId], references: [staff.id] })
}));

export const teamSupervisorRelations = relations(teamSupervisor, ({ one }) => ({
	team: one(team, { fields: [teamSupervisor.teamId], references: [team.id] }),
	staff: one(staff, { fields: [teamSupervisor.staffId], references: [staff.id] })
}));

export const rosterOverrideRelations = relations(rosterOverride, ({ one }) => ({
	staff: one(staff, { fields: [rosterOverride.staffId], references: [staff.id] })
}));

export const overtimeApprovalRelations = relations(overtimeApproval, ({ one }) => ({
	staff: one(staff, { fields: [overtimeApproval.staffId], references: [staff.id] })
}));

export type ShiftPattern = typeof shiftPattern.$inferSelect;
export type NewShiftPattern = typeof shiftPattern.$inferInsert;
export type TeamSupervisor = typeof teamSupervisor.$inferSelect;
export type NewTeamSupervisor = typeof teamSupervisor.$inferInsert;
export type RosterOverride = typeof rosterOverride.$inferSelect;
export type NewRosterOverride = typeof rosterOverride.$inferInsert;
export type OvertimeApproval = typeof overtimeApproval.$inferSelect;
export type NewOvertimeApproval = typeof overtimeApproval.$inferInsert;
