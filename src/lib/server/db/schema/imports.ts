import { relations } from 'drizzle-orm';
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { ImportIssue, ImportRowData } from '#lib/types/imports.js';
import { user } from './auth.js';

export const importKind = pgEnum('import_kind', ['staff', 'flights']);

export const importStatus = pgEnum('import_status', ['previewed', 'committed', 'failed']);

export const importAction = pgEnum('import_action', ['create', 'update', 'skip']);

/** One uploaded file. Commit applies every `create` / `update` row in a single batch. */
export const importBatch = pgTable(
	'import_batch',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		kind: importKind('kind').notNull(),
		fileName: text('file_name').notNull(),
		status: importStatus('status').notNull().default('previewed'),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		totalRows: integer('total_rows').notNull().default(0),
		createCount: integer('create_count').notNull().default(0),
		updateCount: integer('update_count').notNull().default(0),
		skipCount: integer('skip_count').notNull().default(0),
		errorCount: integer('error_count').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [index('import_batch_created_at_idx').on(t.createdAt)]
);

/** One parsed row. `errors` is an array of localized message keys / column errors. */
export const importRow = pgTable(
	'import_row',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		batchId: uuid('batch_id')
			.notNull()
			.references(() => importBatch.id, { onDelete: 'cascade' }),
		rowNo: integer('row_no').notNull(),
		raw: jsonb('raw').$type<Record<string, string>>(),
		parsed: jsonb('parsed').$type<ImportRowData>(),
		errors: jsonb('errors').$type<ImportIssue[]>(),
		action: importAction('action').notNull().default('skip'),
		targetId: uuid('target_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('import_row_batch_row_unique').on(t.batchId, t.rowNo),
		index('import_row_batch_idx').on(t.batchId)
	]
);

export const importBatchRelations = relations(importBatch, ({ one, many }) => ({
	createdByUser: one(user, { fields: [importBatch.createdBy], references: [user.id] }),
	rows: many(importRow)
}));

export const importRowRelations = relations(importRow, ({ one }) => ({
	batch: one(importBatch, { fields: [importRow.batchId], references: [importBatch.id] })
}));

export type ImportBatch = typeof importBatch.$inferSelect;
export type NewImportBatch = typeof importBatch.$inferInsert;
export type ImportRow = typeof importRow.$inferSelect;
export type NewImportRow = typeof importRow.$inferInsert;
