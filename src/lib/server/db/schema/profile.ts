import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { staff } from './workforce.js';

// The employee profile beyond what the roster needs (plan 2026-11-01-employee-profile). Every table
// here except the two lists holds personal data (CLAUDE.md §1). Rows are removed with `removed_at`,
// never deleted (H10); list items are deactivated.

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
};

const removal = {
	removedAt: timestamp('removed_at', { withTimezone: true }),
	removedBy: uuid('removed_by').references(() => user.id, { onDelete: 'set null' })
};

/** Skills HR can give a person: soft skills, languages, licences (H4). */
export const skill = pgTable('skill', {
	id: uuid('id').primaryKey().defaultRandom(),
	nameEn: text('name_en').notNull().unique(),
	nameAr: text('name_ar').notNull(),
	active: boolean('active').notNull().default(true),
	...timestamps
});

/** Papers HR collects; `required` ones make up "received 3 of 5" (H5). */
export const documentType = pgTable('document_type', {
	id: uuid('id').primaryKey().defaultRandom(),
	nameEn: text('name_en').notNull().unique(),
	nameAr: text('name_ar').notNull(),
	required: boolean('required').notNull().default(false),
	active: boolean('active').notNull().default(true),
	...timestamps
});

/** Things HR hands out and gets back: phone, SIM line, uniform… (H11). */
export const custodyItemType = pgTable('custody_item_type', {
	id: uuid('id').primaryKey().defaultRandom(),
	nameEn: text('name_en').notNull().unique(),
	nameAr: text('name_ar').notNull(),
	active: boolean('active').notNull().default(true),
	...timestamps
});

/** People to call in an emergency (third persons' data), any number, ordered by `position` (H2). */
export const staffEmergencyContact = pgTable(
	'staff_emergency_contact',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		name: text('name').notNull(),
		relationship: text('relationship').notNull(),
		phone: text('phone').notNull(),
		phone2: text('phone_2'),
		position: smallint('position').notNull().default(0),
		...removal,
		...timestamps
	},
	(t) => [index('staff_emergency_contact_staff_idx').on(t.staffId)]
);

/** Earlier jobs; years of experience are computed from these and `staff.start_date` (H3). */
export const staffExperience = pgTable(
	'staff_experience',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		employer: text('employer').notNull(),
		jobTitle: text('job_title').notNull(),
		startedOn: date('started_on', { mode: 'string' }).notNull(),
		/** `null` = still ongoing (counted until today). */
		endedOn: date('ended_on', { mode: 'string' }),
		note: text('note'),
		...removal,
		...timestamps
	},
	(t) => [
		index('staff_experience_staff_idx').on(t.staffId),
		check(
			'staff_experience_dates_order',
			sql`${t.endedOn} IS NULL OR ${t.endedOn} >= ${t.startedOn}`
		)
	]
);

/** A skill a person has, with an optional level 1–3 (H4). One live row per person and skill. */
export const staffSkill = pgTable(
	'staff_skill',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		skillId: uuid('skill_id')
			.notNull()
			.references(() => skill.id, { onDelete: 'restrict' }),
		level: smallint('level'),
		...removal,
		...timestamps
	},
	(t) => [
		uniqueIndex('staff_skill_active_unique')
			.on(t.staffId, t.skillId)
			.where(sql`${t.removedAt} IS NULL`),
		index('staff_skill_skill_idx').on(t.skillId),
		check('staff_skill_level_range', sql`${t.level} IS NULL OR ${t.level} BETWEEN 1 AND 3`)
	]
);

/**
 * Whether a person handed in a paper, when, and its number (H5). No scans (Q-H5). One row per
 * person and type, updated in place; the audit log keeps earlier states.
 */
export const staffDocument = pgTable(
	'staff_document',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		documentTypeId: uuid('document_type_id')
			.notNull()
			.references(() => documentType.id, { onDelete: 'restrict' }),
		received: boolean('received').notNull().default(false),
		receivedOn: date('received_on', { mode: 'string' }),
		referenceNo: text('reference_no'),
		expiresOn: date('expires_on', { mode: 'string' }),
		note: text('note'),
		...timestamps
	},
	(t) => [
		unique('staff_document_staff_type_unique').on(t.staffId, t.documentTypeId),
		index('staff_document_type_idx').on(t.documentTypeId),
		check('staff_document_received_on', sql`NOT ${t.received} OR ${t.receivedOn} IS NOT NULL`)
	]
);

/** Social media accounts, all optional (H7). `handle` is a handle or a URL. */
export const staffSocialAccount = pgTable(
	'staff_social_account',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		platform: text('platform').notNull(),
		handle: text('handle').notNull(),
		...removal,
		...timestamps
	},
	(t) => [index('staff_social_account_staff_idx').on(t.staffId)]
);

/**
 * An item in a person's custody and its current condition (H11). The status changes in place; the
 * audit log keeps each earlier status. `removed_at` only for rows entered by mistake.
 */
export const staffCustodyItem = pgTable(
	'staff_custody_item',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		staffId: uuid('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'restrict' }),
		itemTypeId: uuid('item_type_id')
			.notNull()
			.references(() => custodyItemType.id, { onDelete: 'restrict' }),
		/** Serial number, IMEI, line number, size… */
		identifier: text('identifier'),
		issuedOn: date('issued_on', { mode: 'string' }).notNull(),
		status: text('status').notNull().default('with_employee'),
		/** When the status last changed (returned, lost…); `null` while with the employee. */
		statusOn: date('status_on', { mode: 'string' }),
		note: text('note'),
		...removal,
		...timestamps
	},
	(t) => [
		index('staff_custody_item_staff_idx').on(t.staffId),
		index('staff_custody_item_type_idx').on(t.itemTypeId),
		check(
			'staff_custody_item_status',
			sql`${t.status} IN ('with_employee', 'returned', 'lost', 'damaged')`
		),
		check(
			'staff_custody_item_status_on',
			sql`${t.statusOn} IS NULL OR ${t.statusOn} >= ${t.issuedOn}`
		)
	]
);

export const staffSkillRelations = relations(staffSkill, ({ one }) => ({
	staff: one(staff, { fields: [staffSkill.staffId], references: [staff.id] }),
	skill: one(skill, { fields: [staffSkill.skillId], references: [skill.id] })
}));

export const staffDocumentRelations = relations(staffDocument, ({ one }) => ({
	staff: one(staff, { fields: [staffDocument.staffId], references: [staff.id] }),
	documentType: one(documentType, {
		fields: [staffDocument.documentTypeId],
		references: [documentType.id]
	})
}));

export type Skill = typeof skill.$inferSelect;
export type DocumentType = typeof documentType.$inferSelect;
export type StaffEmergencyContact = typeof staffEmergencyContact.$inferSelect;
export type StaffExperience = typeof staffExperience.$inferSelect;
export type StaffSkill = typeof staffSkill.$inferSelect;
export type StaffDocument = typeof staffDocument.$inferSelect;
export type CustodyItemType = typeof custodyItemType.$inferSelect;
export type StaffCustodyItem = typeof staffCustodyItem.$inferSelect;
export type StaffSocialAccount = typeof staffSocialAccount.$inferSelect;
