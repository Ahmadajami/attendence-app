import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
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

/** Job titles (supervisor, agent…), managed where they are picked (redesign plan V5); separate from the work area (profile plan H6). */
export const jobTitle = pgTable('job_title', {
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

/**
 * The department tree, managed in the app (plan D25: seeded once from Odoo, `odoo_id` kept for
 * seeded rows). A name is unique among its siblings. Deactivated, never deleted; the BL refuses
 * moves that would make a department its own ancestor.
 */
export const department = pgTable(
	'department',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		nameEn: text('name_en').notNull(),
		nameAr: text('name_ar').notNull(),
		parentId: uuid('parent_id').references((): AnyPgColumn => department.id, {
			onDelete: 'restrict'
		}),
		managerStaffId: uuid('manager_staff_id').references((): AnyPgColumn => staff.id, {
			onDelete: 'set null'
		}),
		active: boolean('active').notNull().default(true),
		odooId: text('odoo_id').unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('department_parent_id_idx').on(t.parentId),
		unique('department_sibling_name_unique').on(t.parentId, t.nameEn).nullsNotDistinct(),
		check('department_not_own_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`)
	]
);

/**
 * A group of staff that works and is rostered as a unit, in one department (plan D22; nullable for
 * teams made before the builder plan, required by the form). Deactivated, never deleted.
 */
export const team = pgTable('team', {
	id: uuid('id').primaryKey().defaultRandom(),
	nameEn: text('name_en').notNull().unique(),
	nameAr: text('name_ar').notNull(),
	departmentId: uuid('department_id').references(() => department.id, { onDelete: 'restrict' }),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

/**
 * A staff member (managed in the app, plan D25). New hires get a generated `employee_no` (D28).
 * At most one team (`team_id`) and one department; deactivated instead of deleted.
 */
export const staff = pgTable(
	'staff',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		employeeNo: text('employee_no').notNull().unique(),
		fullName: text('full_name').notNull(),
		fullNameAr: text('full_name_ar'),
		/**
		 * Name parts (profile plan H1). When both parts of a language are set, the service keeps
		 * `full_name` / `full_name_ar` as "first last"; seeded rows keep their full name until HR
		 * fills the parts.
		 */
		firstNameEn: text('first_name_en'),
		lastNameEn: text('last_name_en'),
		firstNameAr: text('first_name_ar'),
		lastNameAr: text('last_name_ar'),
		jobTitleId: uuid('job_title_id').references(() => jobTitle.id, { onDelete: 'restrict' }),
		personalEmail: text('personal_email'),
		phone: text('phone'),
		functionId: uuid('function_id').references(() => staffFunction.id, { onDelete: 'restrict' }),
		departmentId: uuid('department_id').references((): AnyPgColumn => department.id, {
			onDelete: 'restrict'
		}),
		/** Where Odoo sends this person's attendance emails (plan D26). */
		workEmail: text('work_email'),
		startDate: date('start_date', { mode: 'string' }),
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
		index('staff_department_id_idx').on(t.departmentId),
		index('staff_job_title_id_idx').on(t.jobTitleId),
		check('staff_employee_no_digits', sql`${t.employeeNo} ~ '^[0-9]+$'`),
		check(
			'staff_personal_email_format',
			sql`${t.personalEmail} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`
		)
	]
);

/**
 * Who was in which team, and when (OPERATIONS_PLAN X6). `staff.team_id` is the current team; this is
 * its history, so reports can tell who was in which team after people move. `valid_to` is
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

export const jobTitleRelations = relations(jobTitle, ({ many }) => ({
	staff: many(staff)
}));

export const departmentRelations = relations(department, ({ one, many }) => ({
	parent: one(department, {
		fields: [department.parentId],
		references: [department.id],
		relationName: 'department_parent'
	}),
	children: many(department, { relationName: 'department_parent' }),
	manager: one(staff, {
		fields: [department.managerStaffId],
		references: [staff.id],
		relationName: 'department_manager'
	}),
	members: many(staff, { relationName: 'staff_department' }),
	teams: many(team)
}));

export const teamRelations = relations(team, ({ one, many }) => ({
	department: one(department, { fields: [team.departmentId], references: [department.id] }),
	members: many(staff),
	memberships: many(staffTeamMembership)
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
	function: one(staffFunction, {
		fields: [staff.functionId],
		references: [staffFunction.id]
	}),
	team: one(team, { fields: [staff.teamId], references: [team.id] }),
	jobTitle: one(jobTitle, { fields: [staff.jobTitleId], references: [jobTitle.id] }),
	department: one(department, {
		fields: [staff.departmentId],
		references: [department.id],
		relationName: 'staff_department'
	}),
	managedDepartments: many(department, { relationName: 'department_manager' }),
	user: one(user, { fields: [staff.userId], references: [user.id] }),
	memberships: many(staffTeamMembership)
}));

export const staffTeamMembershipRelations = relations(staffTeamMembership, ({ one }) => ({
	staff: one(staff, { fields: [staffTeamMembership.staffId], references: [staff.id] }),
	team: one(team, { fields: [staffTeamMembership.teamId], references: [team.id] })
}));

export type StaffFunction = typeof staffFunction.$inferSelect;
export type NewStaffFunction = typeof staffFunction.$inferInsert;
export type JobTitle = typeof jobTitle.$inferSelect;
export type Department = typeof department.$inferSelect;
export type NewDepartment = typeof department.$inferInsert;
export type Team = typeof team.$inferSelect;
export type NewTeam = typeof team.$inferInsert;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type StaffTeamMembership = typeof staffTeamMembership.$inferSelect;
