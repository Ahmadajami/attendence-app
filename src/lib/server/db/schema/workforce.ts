import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** Configurable lookup (ramp, baggage, check-in, gate…). Seeded in a custom migration. */
export const staffFunction = pgTable('staff_function', {
	id: uuid('id').primaryKey().defaultRandom(),
	key: text('key').notNull().unique(),
	nameEn: text('name_en').notNull(),
	nameAr: text('name_ar').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

/** A group of staff assigned to flights as a unit. Deactivated, never deleted. */
export const team = pgTable('team', {
	id: uuid('id').primaryKey().defaultRandom(),
	nameEn: text('name_en').notNull().unique(),
	nameAr: text('name_ar').notNull(),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

/** A staff member. At most one team (`team_id`), deactivated instead of deleted. */
export const staff = pgTable(
	'staff',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		employeeNo: text('employee_no').notNull().unique(),
		fullName: text('full_name').notNull(),
		fullNameAr: text('full_name_ar'),
		phone: text('phone'),
		functionId: uuid('function_id')
			.notNull()
			.references(() => staffFunction.id, { onDelete: 'restrict' }),
		teamId: uuid('team_id').references(() => team.id, { onDelete: 'set null' }),
		userId: uuid('user_id')
			.unique()
			.references(() => user.id, { onDelete: 'set null' }),
		active: boolean('active').notNull().default(true),
		odooId: text('odoo_id').unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('staff_function_id_idx').on(t.functionId),
		index('staff_team_id_idx').on(t.teamId),
		check('staff_employee_no_digits', sql`${t.employeeNo} ~ '^[0-9]+$'`)
	]
);

/**
 * Who was in which team, and when (OPERATIONS_PLAN X6). `staff.team_id` is the current team; this is
 * its history, so the daily report can tell who worked a flight after people move. `valid_to` is
 * `null` while the membership is open. A custom migration adds `EXCLUDE USING gist (staff_id WITH =,
 * tstzrange(valid_from, valid_to, '[)') WITH &&)`, so one person is in one team at a time.
 * Insert / close only, in the same `db.batch` as the `staff.team_id` change.
 */
export const staffTeamMembership = pgTable(
	'staff_team_membership',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		teamId: uuid('team_id')
			.notNull()
			.references(() => team.id, { onDelete: 'restrict' }),
		validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
		validTo: timestamp('valid_to', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('staff_team_membership_staff_idx').on(t.staffId, t.validFrom),
		index('staff_team_membership_team_idx').on(t.teamId, t.validFrom),
		check(
			'staff_team_membership_valid_order',
			sql`${t.validTo} IS NULL OR ${t.validTo} > ${t.validFrom}`
		)
	]
);

export const staffFunctionRelations = relations(staffFunction, ({ many }) => ({
	staff: many(staff)
}));

export const teamRelations = relations(team, ({ many }) => ({
	members: many(staff),
	memberships: many(staffTeamMembership)
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
	function: one(staffFunction, {
		fields: [staff.functionId],
		references: [staffFunction.id]
	}),
	team: one(team, { fields: [staff.teamId], references: [team.id] }),
	user: one(user, { fields: [staff.userId], references: [user.id] }),
	memberships: many(staffTeamMembership)
}));

export const staffTeamMembershipRelations = relations(staffTeamMembership, ({ one }) => ({
	staff: one(staff, { fields: [staffTeamMembership.staffId], references: [staff.id] }),
	team: one(team, { fields: [staffTeamMembership.teamId], references: [team.id] })
}));

export type StaffFunction = typeof staffFunction.$inferSelect;
export type NewStaffFunction = typeof staffFunction.$inferInsert;
export type Team = typeof team.$inferSelect;
export type NewTeam = typeof team.$inferInsert;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type StaffTeamMembership = typeof staffTeamMembership.$inferSelect;
