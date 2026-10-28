import { relations } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { SettingKey, SettingValue } from '#lib/schemas/settings.schema.js';
import { user } from './auth.js';

/**
 * Airport-wide settings the admin enters (`settings.manage`), one row per key. The value's shape is
 * the key's zod schema in `#lib/schemas/settings.schema.ts`. Not seeded: screens that need a key ask
 * the admin to set it first. Changes are audited in the same batch (CLAUDE.md §6.3).
 */
export const appSetting = pgTable('app_setting', {
	key: text('key').$type<SettingKey>().primaryKey(),
	value: jsonb('value').$type<SettingValue>().notNull(),
	updatedBy: uuid('updated_by').references(() => user.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

export const appSettingRelations = relations(appSetting, ({ one }) => ({
	updatedByUser: one(user, { fields: [appSetting.updatedBy], references: [user.id] })
}));

export type AppSetting = typeof appSetting.$inferSelect;
export type NewAppSetting = typeof appSetting.$inferInsert;
