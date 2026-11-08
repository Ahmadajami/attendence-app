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
 * moves that would make a department its own ancestor. Its manager lives in `department_manager`
 * (dated, management plan M3).
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
		/** Parents' names (profile plan H13): optional, one field per language. */
		fatherNameEn: text('father_name_en'),
		fatherNameAr: text('father_name_ar'),
		motherNameEn: text('mother_name_en'),
		motherNameAr: text('mother_name_ar'),
		/** National ID card (H13): number, issue date, expiry date (not before the issue date). */
		nationalIdNo: text('national_id_no'),
		nationalIdIssuedOn: date('national_id_issued_on', { mode: 'string' }),
		nationalIdExpiresOn: date('national_id_expires_on', { mode: 'string' }),
		passportNo: text('passport_no'),
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
		/**
		 * The person's old Odoo badge (employee import plan EI5), kept to link historical punches and
		 * the fingerprint device when it differs from `employee_no`. Not shown in the UI yet.
		 */
		legacyBadgeNo: text('legacy_badge_no').unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		check('staff_legacy_badge_no_digits', sql`${t.legacyBadgeNo} ~ '^[0-9]+$'`),
		index('staff_function_id_idx').on(t.functionId),
		index('staff_team_id_idx').on(t.teamId),
		index('staff_department_id_idx').on(t.departmentId),
		index('staff_job_title_id_idx').on(t.jobTitleId),
		check('staff_employee_no_digits', sql`${t.employeeNo} ~ '^[0-9]+$'`),
		check(
			'staff_personal_email_format',
			sql`${t.personalEmail} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`
		),
		check(
			'staff_national_id_dates',
			sql`${t.nationalIdExpiresOn} IS NULL OR ${t.nationalIdIssuedOn} IS NULL OR ${t.nationalIdExpiresOn} >= ${t.nationalIdIssuedOn}`
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

/**
 * Who manages a department, and when (management plan M3): at most one manager per department on
 * any day (M2), dated by day like pattern assignments. `valid_to` is exclusive, `null` while open.
 * A custom migration adds `EXCLUDE USING gist (department_id WITH =, daterange(valid_from,
 * valid_to, '[)') WITH &&)`. A change from a date closes the row in force there and replaces rows
 * that start on or after it (`planVersionChange`); every change is audited.
 */
export const departmentManager = pgTable(
	'department_manager',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		departmentId: uuid('department_id')
			.notNull()
			.references(() => department.id, { onDelete: 'restrict' }),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		validFrom: date('valid_from', { mode: 'string' }).notNull(),
		/** Exclusive; `null` while the row is open. */
		validTo: date('valid_to', { mode: 'string' }),
		reason: text('reason').notNull(),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('department_manager_department_idx').on(t.departmentId, t.validFrom),
		index('department_manager_staff_idx').on(t.staffId, t.validFrom),
		check(
			'department_manager_valid_order',
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
	managers: many(departmentManager),
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
	managedDepartments: many(departmentManager),
	user: one(user, { fields: [staff.userId], references: [user.id] }),
	memberships: many(staffTeamMembership)
}));

export const staffTeamMembershipRelations = relations(staffTeamMembership, ({ one }) => ({
	staff: one(staff, { fields: [staffTeamMembership.staffId], references: [staff.id] }),
	team: one(team, { fields: [staffTeamMembership.teamId], references: [team.id] })
}));

export const departmentManagerRelations = relations(departmentManager, ({ one }) => ({
	department: one(department, {
		fields: [departmentManager.departmentId],
		references: [department.id]
	}),
	staff: one(staff, { fields: [departmentManager.staffId], references: [staff.id] })
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
export type DepartmentManager = typeof departmentManager.$inferSelect;
export type NewDepartmentManager = typeof departmentManager.$inferInsert;
