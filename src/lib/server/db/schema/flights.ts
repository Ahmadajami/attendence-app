import { sql } from 'drizzle-orm';
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

export const flightDirection = pgEnum('flight_direction', ['arrival', 'departure']);

export const flightStatus = pgEnum('flight_status', [
	'scheduled',
	'delayed',
	'boarding',
	'departed',
	'arrived',
	'cancelled',
	'diverted'
]);

export const flightSource = pgEnum('flight_source', ['manual', 'import', 'feed']);

/**
 * One arrival or departure. `handling_*` is copied from the default window at creation and can be
 * overridden per flight (audited). Cancelled, never deleted (CLAUDE.md §6.6).
 */
export const flight = pgTable(
	'flight',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		airlineCode: text('airline_code').notNull(),
		flightNo: text('flight_no').notNull(),
		direction: flightDirection('direction').notNull(),
		origin: text('origin'),
		destination: text('destination'),
		scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
		estimatedAt: timestamp('estimated_at', { withTimezone: true }),
		actualAt: timestamp('actual_at', { withTimezone: true }),
		status: flightStatus('status').notNull().default('scheduled'),
		stand: text('stand'),
		gate: text('gate'),
		aircraftType: text('aircraft_type'),
		handlingStartsAt: timestamp('handling_starts_at', { withTimezone: true }).notNull(),
		handlingEndsAt: timestamp('handling_ends_at', { withTimezone: true }).notNull(),
		source: flightSource('source').notNull().default('manual'),
		externalRef: text('external_ref'),
		/** Optional https image (airline logo) shown on the flight report. */
		imageUrl: text('image_url'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('flight_source_external_ref_unique').on(t.source, t.externalRef),
		index('flight_scheduled_at_idx').on(t.scheduledAt),
		check('flight_handling_window_order', sql`${t.handlingEndsAt} > ${t.handlingStartsAt}`)
	]
);

export type Flight = typeof flight.$inferSelect;
export type NewFlight = typeof flight.$inferInsert;
