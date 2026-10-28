import { relations, sql } from 'drizzle-orm';
import {
	boolean,
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
import { PATTERN_TYPES } from '#lib/schemas/enums.js';
import { user } from './auth.js';
import { department, staff, team } from './workforce.js';

export const patternType = pgEnum('pattern_type', PATTERN_TYPES);

/**
 * A shift people are rostered on: Damascus wall-clock start and end; an end at or before the start
 * ends the next day (`ends_next_day`, generated). Span and night are computed in TS
 * (`#lib/payroll/schedule.ts`). Once a pattern, override or punch uses a shift, its times, break and
 * required minutes are locked (plan P1); create a new shift instead. Deactivated, never deleted: a
 * custom migration refuses a delete while a pattern slot points at it.
 */
export const shift = pgTable(
	'shift',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** 1–3 of `A–Z0–9`; `OFF` is reserved for the off day. */
		code: text('code').notNull().unique('shift_code_unique'),
		nameEn: text('name_en').notNull(),
		nameAr: text('name_ar').notNull(),
		/** `#rrggbb` from the shift palette. */
		colour: text('colour').notNull(),
		startTime: time('start_time').notNull(),
		endTime: time('end_time').notNull(),
		endsNextDay: boolean('ends_next_day')
			.notNull()
			.generatedAlwaysAs(sql`"end_time" <= "start_time"`),
		breakMinutes: integer('break_minutes').notNull().default(0),
		/** `null`: the span minus the break. */
		requiredMinutes: integer('required_minutes'),
		/** Punches count for the shift from this long before its start… */
		windowBeforeMinutes: integer('window_before_minutes').notNull().default(180),
		/** …to this long after its end. */
		windowAfterMinutes: integer('window_after_minutes').notNull().default(360),
		/** Late after this many minutes; 0 = not set (the default grace applies, plan D12). */
		graceMinutes: integer('grace_minutes').notNull().default(0),
		active: boolean('active').notNull().default(true),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		check('shift_code_format', sql`${t.code} ~ '^[A-Z0-9]{1,3}$' AND ${t.code} <> 'OFF'`),
		check('shift_colour_format', sql`${t.colour} ~ '^#[0-9a-f]{6}$'`),
		check('shift_break_range', sql`${t.breakMinutes} BETWEEN 0 AND 720`),
		check(
			'shift_required_range',
			sql`${t.requiredMinutes} IS NULL OR ${t.requiredMinutes} BETWEEN 1 AND 1440`
		),
		check(
			'shift_window_range',
			sql`${t.windowBeforeMinutes} BETWEEN 0 AND 720 AND ${t.windowAfterMinutes} BETWEEN 0 AND 720`
		),
		check('shift_grace_range', sql`${t.graceMinutes} BETWEEN 0 AND 120`)
	]
);

/**
 * One version of a repeating pattern. It belongs to one person, a team or a department (precedence
 * in that order; a department's pattern also covers its sub-departments). `slots` are shift ids,
 * `NULL` = off: `weekly` has 7 (Sunday first), `cycle` has 1–28 and slot 0 falls on `anchor_date`,
 * repeating before and after it. Postgres can't put an FK on array elements, so a custom migration
 * adds a constraint trigger for the slot ids. Versions are never edited: a change closes the current
 * one (`effective_to`) and opens the next. Custom migrations add one `EXCLUDE` per owner kind so
 * versions of one owner never overlap.
 */
export const shiftPattern = pgTable(
	'shift_pattern',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		teamId: uuid('team_id').references(() => team.id, { onDelete: 'restrict' }),
		staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'restrict' }),
		departmentId: uuid('department_id').references(() => department.id, {
			onDelete: 'restrict'
		}),
		type: patternType('type').notNull(),
		slots: uuid('slots').array().notNull().$type<(string | null)[]>(),
		/** Required for a `cycle` (its slot 0), `null` for `weekly`. */
		anchorDate: date('anchor_date', { mode: 'string' }),
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
		index('shift_pattern_department_idx').on(t.departmentId, t.effectiveFrom),
		check(
			'shift_pattern_one_owner',
			sql`num_nonnulls(${t.teamId}, ${t.staffId}, ${t.departmentId}) = 1`
		),
		check(
			'shift_pattern_slots_shape',
			sql`array_ndims(${t.slots}) = 1 AND CASE ${t.type} WHEN 'weekly' THEN cardinality(${t.slots}) = 7 ELSE cardinality(${t.slots}) BETWEEN 1 AND 28 END`
		),
		check('shift_pattern_slots_work', sql`cardinality(array_remove(${t.slots}, NULL)) > 0`),
		check('shift_pattern_anchor', sql`(${t.type} = 'cycle') = (${t.anchorDate} IS NOT NULL)`),
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
 * A one-off shift or day off (`shift_id` NULL) for one person on one shift date, with a reason. A
 * shift on a rostered off day that isn't part of a swap is an extra shift (all of it is overtime). The
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
		/** `null`: off. */
		shiftId: uuid('shift_id').references(() => shift.id, { onDelete: 'restrict' }),
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

export const shiftPatternRelations = relations(shiftPattern, ({ one }) => ({
	team: one(team, { fields: [shiftPattern.teamId], references: [team.id] }),
	staff: one(staff, { fields: [shiftPattern.staffId], references: [staff.id] }),
	department: one(department, {
		fields: [shiftPattern.departmentId],
		references: [department.id]
	})
}));

export const teamSupervisorRelations = relations(teamSupervisor, ({ one }) => ({
	team: one(team, { fields: [teamSupervisor.teamId], references: [team.id] }),
	staff: one(staff, { fields: [teamSupervisor.staffId], references: [staff.id] })
}));

export const rosterOverrideRelations = relations(rosterOverride, ({ one }) => ({
	staff: one(staff, { fields: [rosterOverride.staffId], references: [staff.id] }),
	shift: one(shift, { fields: [rosterOverride.shiftId], references: [shift.id] })
}));

export type Shift = typeof shift.$inferSelect;
export type NewShift = typeof shift.$inferInsert;
export type ShiftPattern = typeof shiftPattern.$inferSelect;
export type NewShiftPattern = typeof shiftPattern.$inferInsert;
export type TeamSupervisor = typeof teamSupervisor.$inferSelect;
export type NewTeamSupervisor = typeof teamSupervisor.$inferInsert;
export type RosterOverride = typeof rosterOverride.$inferSelect;
export type NewRosterOverride = typeof rosterOverride.$inferInsert;
