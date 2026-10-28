import { relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** Insert-only. Written in the same `db.batch([...])` as the change it records (CLAUDE.md §6.3). */
export const auditLog = pgTable(
	'audit_log',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// Null for system actions such as the first-admin bootstrap script.
		actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
		action: text('action').notNull(),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id').notNull(),
		before: jsonb('before'),
		after: jsonb('after'),
		reason: text('reason'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('audit_log_entity_idx').on(t.entityType, t.entityId),
		index('audit_log_created_at_idx').on(t.createdAt)
	]
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
	actor: one(user, { fields: [auditLog.actorUserId], references: [user.id] })
}));

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
