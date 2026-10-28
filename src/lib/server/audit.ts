import { db } from '#lib/server/db/index.js';
import { auditLog } from '#lib/server/db/schema/index.js';

/** `null` for system actions (e.g. the first-admin bootstrap script). */
export type AuditActor = { id: string } | null;

export type AuditEntry = {
	actor: AuditActor;
	/** Dotted verb, e.g. `user.create`, `user.password_reset`, `flight.cancel`. */
	action: string;
	entityType: string;
	entityId: string;
	before?: unknown;
	after?: unknown;
	/** Required for manual overrides (CLAUDE.md §6.3). */
	reason?: string | null;
};

/**
 * Insert query for one audit row. Put it in the same `db.batch([...])` as the change it records,
 * so the change and its audit trail commit (or fail) together. Never log password hashes or tokens.
 */
export function auditInsert(entry: AuditEntry) {
	return db.insert(auditLog).values({
		actorUserId: entry.actor?.id ?? null,
		action: entry.action,
		entityType: entry.entityType,
		entityId: entry.entityId,
		before: entry.before ?? null,
		after: entry.after ?? null,
		reason: entry.reason ?? null
	});
}
