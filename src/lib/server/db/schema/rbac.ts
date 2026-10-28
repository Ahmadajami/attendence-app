import { relations } from 'drizzle-orm';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { PermissionKey, RoleKey } from '#lib/server/rbac/permissions.js';
import { user } from './auth.js';

export const role = pgTable('role', {
	id: uuid('id').primaryKey().defaultRandom(),
	/** Seeded keys only (`0001_seed_rbac`), so the column is typed as the closed set. */
	key: text('key').$type<RoleKey>().notNull().unique(),
	nameEn: text('name_en').notNull(),
	nameAr: text('name_ar').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

export const permission = pgTable('permission', {
	id: uuid('id').primaryKey().defaultRandom(),
	/** Seeded keys only, kept in sync with `PERMISSIONS` (CLAUDE.md §7). */
	key: text('key').$type<PermissionKey>().notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

export const rolePermission = pgTable(
	'role_permission',
	{
		roleId: uuid('role_id')
			.notNull()
			.references(() => role.id, { onDelete: 'cascade' }),
		permissionId: uuid('permission_id')
			.notNull()
			.references(() => permission.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]
);

export const roleRelations = relations(role, ({ many }) => ({
	users: many(user),
	rolePermissions: many(rolePermission)
}));

export const permissionRelations = relations(permission, ({ many }) => ({
	rolePermissions: many(rolePermission)
}));

export const rolePermissionRelations = relations(rolePermission, ({ one }) => ({
	role: one(role, { fields: [rolePermission.roleId], references: [role.id] }),
	permission: one(permission, {
		fields: [rolePermission.permissionId],
		references: [permission.id]
	})
}));

export type Role = typeof role.$inferSelect;
export type NewRole = typeof role.$inferInsert;
export type Permission = typeof permission.$inferSelect;
export type NewPermission = typeof permission.$inferInsert;
export type RolePermission = typeof rolePermission.$inferSelect;
export type NewRolePermission = typeof rolePermission.$inferInsert;
