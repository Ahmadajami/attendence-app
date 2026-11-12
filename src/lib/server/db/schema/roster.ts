import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	smallint,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { PATTERN_TYPES, SWAP_KINDS, SWAP_SCOPES, SWAP_STATES } from '#lib/schemas/enums.js';
import { user } from './auth.js';
import { importBatch } from './imports.js';
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
		/** The roster or shifts import batch that created this row (undo removes them together). */
		importBatchId: uuid('import_batch_id').references(() => importBatch.id, {
			onDelete: 'restrict'
		}),
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
 * A named, reusable pattern in the library (builder plan B1). `slots` are shift ids, `NULL` = off:
 * `weekly` has 7 (Sunday first), `cycle` has 1–28. Who follows it, and from when, is in
 * `pattern_assignment`. Once an assignment uses it, its type and slots are read-only (B3: "edit from
 * a date" saves a copy). A custom migration checks the slot ids with a constraint trigger and adds
 * the cycle-anchor trigger. Deactivated, never deleted.
 */
export const pattern = pgTable(
	'pattern',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		nameEn: text('name_en').notNull().unique('pattern_name_en_unique'),
		nameAr: text('name_ar').notNull(),
		type: patternType('type').notNull(),
		slots: uuid('slots').array().notNull().$type<(string | null)[]>(),
		/**
		 * Weekly only: the shift a member works on a day the pattern has off but their own off days
		 * don't list (B5). `null`: the pattern's most used shift.
		 */
		defaultWorkShiftId: uuid('default_work_shift_id').references(() => shift.id, {
			onDelete: 'restrict'
		}),
		active: boolean('active').notNull().default(true),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		/** The roster or shifts import batch that created this row (undo removes them together). */
		importBatchId: uuid('import_batch_id').references(() => importBatch.id, {
			onDelete: 'restrict'
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		check(
			'pattern_name_present',
			sql`length(trim(${t.nameEn})) > 0 AND length(trim(${t.nameAr})) > 0`
		),
		check(
			'pattern_slots_shape',
			sql`array_ndims(${t.slots}) = 1 AND CASE ${t.type} WHEN 'weekly' THEN cardinality(${t.slots}) = 7 ELSE cardinality(${t.slots}) BETWEEN 1 AND 28 END`
		),
		check('pattern_slots_work', sql`cardinality(array_remove(${t.slots}, NULL)) > 0`)
	]
);

/**
 * Who follows a pattern, and when (builder plan B1): one person, a team or a department (precedence
 * in that order; a department's assignment also covers its sub-departments, B6). For a cycle,
 * `anchor_date` is the date slot 0 falls on for this target (B4), required iff the pattern is a
 * cycle (a custom-migration trigger, since the type lives on `pattern`). Never edited: a change
 * closes the one in force (`effective_to`) and opens the next. Custom migrations add one `EXCLUDE`
 * per target kind so the assignments of one target never overlap.
 */
export const patternAssignment = pgTable(
	'pattern_assignment',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		patternId: uuid('pattern_id')
			.notNull()
			.references(() => pattern.id, { onDelete: 'restrict' }),
		staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'restrict' }),
		teamId: uuid('team_id').references(() => team.id, { onDelete: 'restrict' }),
		departmentId: uuid('department_id').references(() => department.id, {
			onDelete: 'restrict'
		}),
		anchorDate: date('anchor_date', { mode: 'string' }),
		effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
		/** Exclusive; `null` while the assignment is open. */
		effectiveTo: date('effective_to', { mode: 'string' }),
		reason: text('reason').notNull(),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		/** The roster or shifts import batch that created this row (undo removes them together). */
		importBatchId: uuid('import_batch_id').references(() => importBatch.id, {
			onDelete: 'restrict'
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('pattern_assignment_pattern_idx').on(t.patternId),
		index('pattern_assignment_staff_idx').on(t.staffId, t.effectiveFrom),
		index('pattern_assignment_team_idx').on(t.teamId, t.effectiveFrom),
		index('pattern_assignment_department_idx').on(t.departmentId, t.effectiveFrom),
		check(
			'pattern_assignment_one_target',
			sql`num_nonnulls(${t.staffId}, ${t.teamId}, ${t.departmentId}) = 1`
		),
		check(
			'pattern_assignment_effective_order',
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`
		)
	]
);

/**
 * A person's own schedule rules, versioned like assignments (builder plan B4, B5): own off days
 * (`0` = Sunday … `6` = Saturday) apply to weekly patterns, the crew start (slot offset) to cycles.
 * `NULL` in either: follow the pattern. A custom migration adds an `EXCLUDE` so one person's
 * versions never overlap.
 */
export const staffSchedule = pgTable(
	'staff_schedule',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		offWeekdays: smallint('off_weekdays').array().$type<number[]>(),
		crewStart: smallint('crew_start'),
		effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
		/** Exclusive; `null` while the version is open. */
		effectiveTo: date('effective_to', { mode: 'string' }),
		reason: text('reason').notNull(),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		/** The roster or shifts import batch that created this row (undo removes them together). */
		importBatchId: uuid('import_batch_id').references(() => importBatch.id, {
			onDelete: 'restrict'
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('staff_schedule_staff_idx').on(t.staffId, t.effectiveFrom),
		check('staff_schedule_has_rule', sql`num_nonnulls(${t.offWeekdays}, ${t.crewStart}) > 0`),
		check(
			'staff_schedule_off_weekdays',
			sql`${t.offWeekdays} IS NULL OR (array_ndims(${t.offWeekdays}) = 1 AND ${t.offWeekdays} <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[])`
		),
		check(
			'staff_schedule_crew_start',
			sql`${t.crewStart} IS NULL OR ${t.crewStart} BETWEEN 0 AND 27`
		),
		check(
			'staff_schedule_effective_order',
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`
		)
	]
);

/**
 * A pattern's overtime rule from a date (pay plan PR4–PR6): overtime on/off and the three rates.
 * `pattern_id` NULL: the company's own rule (PR35), which every pattern inherits from. `NULL` in a
 * field: inherit (pattern → department rule, S2.3 → company → the built-in `OVERTIME_DEFAULTS`).
 * Versioned like assignments, never edited: a change closes the open version (`effective_to`) and
 * opens the next. Custom migrations add `EXCLUDE`s so one pattern's versions, and the company's,
 * never overlap.
 */
export const patternPayRule = pgTable(
	'pattern_pay_rule',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** `NULL`: the company's rule (PR35). */
		patternId: uuid('pattern_id').references(() => pattern.id, { onDelete: 'restrict' }),
		otEnabled: boolean('ot_enabled'),
		/** Minutes past the required time on a rostered work day. */
		workDayRate: numeric('work_day_rate', { precision: 4, scale: 2, mode: 'number' }),
		/** Every minute worked on an off day or an extra shift. */
		offDayRate: numeric('off_day_rate', { precision: 4, scale: 2, mode: 'number' }),
		/** Every minute worked on an overtime-eligible holiday. */
		holidayRate: numeric('holiday_rate', { precision: 4, scale: 2, mode: 'number' }),
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
		index('pattern_pay_rule_pattern_idx').on(t.patternId, t.effectiveFrom),
		check(
			'pattern_pay_rule_has_value',
			sql`num_nonnulls(${t.otEnabled}, ${t.workDayRate}, ${t.offDayRate}, ${t.holidayRate}) > 0`
		),
		check(
			'pattern_pay_rule_rate_range',
			sql`(${t.workDayRate} IS NULL OR ${t.workDayRate} BETWEEN 1 AND 5) AND (${t.offDayRate} IS NULL OR ${t.offDayRate} BETWEEN 1 AND 5) AND (${t.holidayRate} IS NULL OR ${t.holidayRate} BETWEEN 1 AND 5)`
		),
		check('pattern_pay_rule_reason_present', sql`length(trim(${t.reason})) > 0`),
		check(
			'pattern_pay_rule_effective_order',
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`
		)
	]
);

/**
 * A holiday on a pattern (pay plan PR2, PR3, PR8): every follower on these shift dates (inclusive,
 * at most 14) has the day off with required 0; work on it is paid at the holiday rate when
 * `ot_eligible`. `pattern_id` NULL: a company holiday (PR36), on every day a pattern plans unless the
 * pattern skips it (`pattern_holiday_exception`); a pattern's own holiday wins on the same date
 * (PR37). Cancelled, never deleted. Custom migrations add `EXCLUDE`s so one pattern's active
 * holidays, and the company's, never overlap.
 */
export const patternHoliday = pgTable(
	'pattern_holiday',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** `NULL`: a company holiday (PR36). */
		patternId: uuid('pattern_id').references(() => pattern.id, { onDelete: 'restrict' }),
		startsOn: date('starts_on', { mode: 'string' }).notNull(),
		endsOn: date('ends_on', { mode: 'string' }).notNull(),
		nameEn: text('name_en').notNull(),
		nameAr: text('name_ar').notNull(),
		otEligible: boolean('ot_eligible').notNull().default(false),
		reason: text('reason').notNull(),
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
		index('pattern_holiday_pattern_idx').on(t.patternId, t.startsOn),
		check(
			'pattern_holiday_dates',
			sql`${t.endsOn} >= ${t.startsOn} AND ${t.endsOn} - ${t.startsOn} < 14`
		),
		check(
			'pattern_holiday_name_present',
			sql`length(trim(${t.nameEn})) > 0 AND length(trim(${t.nameAr})) > 0`
		),
		check('pattern_holiday_reason_present', sql`length(trim(${t.reason})) > 0`)
	]
);

/**
 * How one pattern treats one company holiday (pay plan PR36): skipped (`applies` false: its people
 * work the day as planned) or with its own overtime-eligible switch (`ot_eligible`, `NULL`: as the
 * company's). One row per pattern and holiday, changed in place and audited; no row = applies as
 * the company set it. The service checks that `holiday_id` is a company holiday.
 */
export const patternHolidayException = pgTable(
	'pattern_holiday_exception',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		patternId: uuid('pattern_id')
			.notNull()
			.references(() => pattern.id, { onDelete: 'restrict' }),
		holidayId: uuid('holiday_id')
			.notNull()
			.references(() => patternHoliday.id, { onDelete: 'restrict' }),
		applies: boolean('applies').notNull().default(true),
		otEligible: boolean('ot_eligible'),
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
		uniqueIndex('pattern_holiday_exception_unique').on(t.patternId, t.holidayId),
		index('pattern_holiday_exception_holiday_idx').on(t.holidayId),
		check('pattern_holiday_exception_reason_present', sql`length(trim(${t.reason})) > 0`)
	]
);

export const swapKind = pgEnum('swap_kind', SWAP_KINDS);
export const swapScope = pgEnum('swap_scope', SWAP_SCOPES);
export const swapState = pgEnum('swap_state', SWAP_STATES);

/**
 * A swap request (pay plan PR25–PR28). It changes the roster only when approved: approving re-checks
 * the days and creates `roster_override` rows whose `swap_group_id` is this id; cancelling an
 * approved swap cancels them together. Self swap: `first_date` = the work day that becomes off,
 * `second_date` = the off day that becomes work. Employee swap: `first_date` = the date A works and
 * B is off, `second_date` = the optional return date. Shift change: `first_date` = the work day A
 * works `shift_id` instead of the planned shift (no second date). Never deleted.
 */
export const swapRequest = pgTable(
	'swap_request',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		kind: swapKind('kind').notNull(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		/** Employee swap only: B. */
		otherStaffId: uuid('other_staff_id').references(() => staff.id, { onDelete: 'restrict' }),
		firstDate: date('first_date', { mode: 'string' }).notNull(),
		secondDate: date('second_date', { mode: 'string' }),
		/** Shift change only: the shift A works on `first_date` instead of the planned one. */
		shiftId: uuid('shift_id').references(() => shift.id, { onDelete: 'restrict' }),
		scope: swapScope('scope').notNull(),
		/** The moved work day is paid at the off-day rate (PR28). */
		payAsOt: boolean('pay_as_ot').notNull().default(false),
		reason: text('reason').notNull(),
		state: swapState('state').notNull().default('pending'),
		requestedBy: uuid('requested_by').references(() => user.id, { onDelete: 'set null' }),
		decidedBy: uuid('decided_by').references(() => user.id, { onDelete: 'set null' }),
		/** When it was approved or rejected. */
		decidedAt: timestamp('decided_at', { withTimezone: true }),
		decisionNote: text('decision_note'),
		cancelledBy: uuid('cancelled_by').references(() => user.id, { onDelete: 'set null' }),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
		cancelReason: text('cancel_reason'),
		/** The roster or shifts import batch that created this row (undo removes them together). */
		importBatchId: uuid('import_batch_id').references(() => importBatch.id, {
			onDelete: 'restrict'
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('swap_request_staff_idx').on(t.staffId, t.firstDate),
		index('swap_request_other_idx').on(t.otherStaffId, t.firstDate),
		index('swap_request_state_idx').on(t.state, t.firstDate),
		check(
			'swap_request_other_staff',
			sql`(${t.kind} = 'emp_swap') = (${t.otherStaffId} IS NOT NULL) AND (${t.otherStaffId} IS NULL OR ${t.otherStaffId} <> ${t.staffId})`
		),
		check(
			'swap_request_dates',
			sql`(${t.kind} <> 'self_swap' OR ${t.secondDate} IS NOT NULL) AND (${t.secondDate} IS NULL OR ${t.secondDate} <> ${t.firstDate})`
		),
		// `::text`: the new enum value can't be compared as an enum in the migration that adds it.
		check(
			'swap_request_shift_change',
			sql`(${t.kind}::text = 'shift_change') = (${t.shiftId} IS NOT NULL) AND (${t.kind}::text <> 'shift_change' OR (${t.secondDate} IS NULL AND NOT ${t.payAsOt}))`
		),
		check('swap_request_reason_present', sql`length(trim(${t.reason})) > 0`),
		check(
			'swap_request_state_fields',
			sql`(${t.state} = 'pending') = (${t.decidedAt} IS NULL AND ${t.cancelledAt} IS NULL) AND (${t.state} = 'cancelled') = (${t.cancelledAt} IS NOT NULL) AND (${t.state} NOT IN ('approved', 'rejected') OR ${t.decidedAt} IS NOT NULL) AND (${t.cancelledAt} IS NULL OR length(trim(coalesce(${t.cancelReason}, ''))) > 0)`
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
		/** The roster or shifts import batch that created this row (undo removes them together). */
		importBatchId: uuid('import_batch_id').references(() => importBatch.id, {
			onDelete: 'restrict'
		}),
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

export const patternRelations = relations(pattern, ({ one, many }) => ({
	defaultWorkShift: one(shift, { fields: [pattern.defaultWorkShiftId], references: [shift.id] }),
	assignments: many(patternAssignment),
	payRules: many(patternPayRule),
	holidays: many(patternHoliday)
}));

export const patternPayRuleRelations = relations(patternPayRule, ({ one }) => ({
	pattern: one(pattern, { fields: [patternPayRule.patternId], references: [pattern.id] })
}));

export const patternHolidayRelations = relations(patternHoliday, ({ one, many }) => ({
	pattern: one(pattern, { fields: [patternHoliday.patternId], references: [pattern.id] }),
	exceptions: many(patternHolidayException)
}));

export const patternHolidayExceptionRelations = relations(patternHolidayException, ({ one }) => ({
	pattern: one(pattern, { fields: [patternHolidayException.patternId], references: [pattern.id] }),
	holiday: one(patternHoliday, {
		fields: [patternHolidayException.holidayId],
		references: [patternHoliday.id]
	})
}));

export const patternAssignmentRelations = relations(patternAssignment, ({ one }) => ({
	pattern: one(pattern, { fields: [patternAssignment.patternId], references: [pattern.id] }),
	staff: one(staff, { fields: [patternAssignment.staffId], references: [staff.id] }),
	team: one(team, { fields: [patternAssignment.teamId], references: [team.id] }),
	department: one(department, {
		fields: [patternAssignment.departmentId],
		references: [department.id]
	})
}));

export const staffScheduleRelations = relations(staffSchedule, ({ one }) => ({
	staff: one(staff, { fields: [staffSchedule.staffId], references: [staff.id] })
}));

export const teamSupervisorRelations = relations(teamSupervisor, ({ one }) => ({
	team: one(team, { fields: [teamSupervisor.teamId], references: [team.id] }),
	staff: one(staff, { fields: [teamSupervisor.staffId], references: [staff.id] })
}));

export const swapRequestRelations = relations(swapRequest, ({ one }) => ({
	staff: one(staff, {
		fields: [swapRequest.staffId],
		references: [staff.id],
		relationName: 'swap_request_staff'
	}),
	otherStaff: one(staff, {
		fields: [swapRequest.otherStaffId],
		references: [staff.id],
		relationName: 'swap_request_other_staff'
	})
}));

export const rosterOverrideRelations = relations(rosterOverride, ({ one }) => ({
	staff: one(staff, { fields: [rosterOverride.staffId], references: [staff.id] }),
	shift: one(shift, { fields: [rosterOverride.shiftId], references: [shift.id] })
}));

export type Shift = typeof shift.$inferSelect;
export type NewShift = typeof shift.$inferInsert;
export type Pattern = typeof pattern.$inferSelect;
export type NewPattern = typeof pattern.$inferInsert;
export type PatternAssignment = typeof patternAssignment.$inferSelect;
export type NewPatternAssignment = typeof patternAssignment.$inferInsert;
export type StaffSchedule = typeof staffSchedule.$inferSelect;
export type NewStaffSchedule = typeof staffSchedule.$inferInsert;
export type TeamSupervisor = typeof teamSupervisor.$inferSelect;
export type NewTeamSupervisor = typeof teamSupervisor.$inferInsert;
export type RosterOverride = typeof rosterOverride.$inferSelect;
export type NewRosterOverride = typeof rosterOverride.$inferInsert;
export type PatternPayRule = typeof patternPayRule.$inferSelect;
export type NewPatternPayRule = typeof patternPayRule.$inferInsert;
export type PatternHoliday = typeof patternHoliday.$inferSelect;
export type NewPatternHoliday = typeof patternHoliday.$inferInsert;
export type PatternHolidayException = typeof patternHolidayException.$inferSelect;
export type SwapRequest = typeof swapRequest.$inferSelect;
export type NewSwapRequest = typeof swapRequest.$inferInsert;
