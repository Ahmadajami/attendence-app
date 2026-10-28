// Atomic "batch" over postgres.js. The template ran writes through Neon's `db.batch([...])`; this
// keeps the same call shape: CRUD builders and `auditInsert()` still build queries on the shared
// `db`, and `batch()` runs their SQL in one transaction, so a change and its audit row commit (or
// fail) together. Must not import `$app/*`: the CLI scripts use it too.
import type { SQLWrapper } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/** One statement of a `batch([...])`: what CRUD write builders return. */
export type BatchQuery = SQLWrapper;

export function makeBatch<TSchema extends Record<string, unknown>>(
	database: PostgresJsDatabase<TSchema>
) {
	return async function batch(queries: readonly BatchQuery[]): Promise<void> {
		await database.transaction(async (tx) => {
			// In order: callers rely on it (e.g. removals before an insert, for EXCLUDE constraints).
			for (const query of queries) await tx.execute(query.getSQL());
		});
	};
}
