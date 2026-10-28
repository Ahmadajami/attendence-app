import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { flight } from './flights.js';
import { team } from './workforce.js';

export const assignmentStatus = pgEnum('assignment_status', ['assigned', 'cancelled']);

/**
 * One team on one flight for its handling window. `starts_at` / `ends_at` are copied from the
 * flight window so the overlap constraint keeps working when the flight is rescheduled (the
 * service moves them in the same batch). Never hard-deleted: cancel changes `status`.
 */
export const teamFlightAssignment = pgTable(
	'team_flight_assignment',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		teamId: uuid('team_id')
			.notNull()
			.references(() => team.id, { onDelete: 'restrict' }),
		flightId: uuid('flight_id')
			.notNull()
			.references(() => flight.id, { onDelete: 'restrict' }),
		startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
		endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
		status: assignmentStatus('status').notNull().default('assigned'),
		assignedBy: uuid('assigned_by').references(() => user.id, { onDelete: 'set null' }),
		/** Required when a staff member is forced despite a conflict. */
		overrideReason: text('override_reason'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		index('team_flight_assignment_team_idx').on(t.teamId, t.startsAt),
		index('team_flight_assignment_flight_idx').on(t.flightId),
		uniqueIndex('team_flight_assignment_active_flight_unique')
			.on(t.flightId)
			.where(sql`${t.status} <> 'cancelled'`),
		check('team_flight_assignment_window_order', sql`${t.endsAt} > ${t.startsAt}`)
	]
);

export const flightRelations = relations(flight, ({ many }) => ({
	assignments: many(teamFlightAssignment)
}));

export const teamFlightAssignmentRelations = relations(teamFlightAssignment, ({ one }) => ({
	team: one(team, { fields: [teamFlightAssignment.teamId], references: [team.id] }),
	flight: one(flight, { fields: [teamFlightAssignment.flightId], references: [flight.id] }),
	assignedByUser: one(user, {
		fields: [teamFlightAssignment.assignedBy],
		references: [user.id]
	})
}));

export type TeamFlightAssignment = typeof teamFlightAssignment.$inferSelect;
export type NewTeamFlightAssignment = typeof teamFlightAssignment.$inferInsert;
