import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { role } from './rbac.js';

/**
 * An account. `login_id` is the employee ID number (ASCII digits) and is the only login name;
 * there is no public sign-up, so every row is created by an Admin / Operations Manager.
 */
export const user = pgTable(
	'user',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		loginId: text('login_id').notNull().unique(),
		fullName: text('full_name').notNull(),
		fullNameAr: text('full_name_ar'),
		roleId: uuid('role_id')
			.notNull()
			.references(() => role.id, { onDelete: 'restrict' }),
		active: boolean('active').notNull().default(true),
		// Argon2id hash of the account's current 6-digit sign-in code. Users never choose or change
		// it; an admin (or `pnpm auth:issue-code`) issues a new one.
		passwordHash: text('password_hash').notNull(),
		// When the current code was issued.
		passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
		// When the current code stops working (and every session opened with it).
		passwordExpiresAt: timestamp('password_expires_at', { withTimezone: true }),
		// Consecutive wrong codes; reset on success or when a new code is issued.
		failedLoginCount: integer('failed_login_count').notNull().default(0),
		// Set after too many consecutive wrong codes; cleared when a new code is issued.
		lockedAt: timestamp('locked_at', { withTimezone: true }),
		lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
		createdBy: uuid('created_by').references((): AnyPgColumn => user.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('user_role_id_idx').on(t.roleId),
		check('user_login_id_digits', sql`${t.loginId} ~ '^[0-9]+$'`),
		check('user_failed_login_count_non_negative', sql`${t.failedLoginCount} >= 0`)
	]
);

/** `web` = SSR cookie session; `api` = refresh-token session behind short-lived access JWTs. */
export const sessionClient = pgEnum('session_client', ['web', 'api']);

/**
 * `id` is the SHA-256 (hex) of the secret token (cookie value or refresh token), so a leaked
 * table can't be replayed. Access JWTs carry it as `sid` and are only valid while the row exists.
 */
export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		client: sessionClient('client').notNull().default('web'),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		ip: text('ip'),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('session_user_id_idx').on(t.userId),
		index('session_expires_at_idx').on(t.expiresAt)
	]
);

/** Insert-only log of sign-in attempts; drives login rate limiting. */
export const loginAttempt = pgTable(
	'login_attempt',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		loginId: text('login_id').notNull(),
		ip: text('ip'),
		success: boolean('success').notNull(),
		attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('login_attempt_login_id_attempted_at_idx').on(t.loginId, t.attemptedAt),
		index('login_attempt_ip_attempted_at_idx').on(t.ip, t.attemptedAt)
	]
);

export const userRelations = relations(user, ({ one, many }) => ({
	role: one(role, { fields: [user.roleId], references: [role.id] }),
	createdByUser: one(user, { fields: [user.createdBy], references: [user.id] }),
	sessions: many(session)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type LoginAttempt = typeof loginAttempt.$inferSelect;
export type NewLoginAttempt = typeof loginAttempt.$inferInsert;
