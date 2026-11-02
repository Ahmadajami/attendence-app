import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { swapRequest } from '#lib/server/db/schema/index.js';

// Swap requests (pay plan PR25–PR29). Reads for the recompute; the request screens and writes come
// with Phase 6.

/** The approved swaps among these ids (an override's `swap_group_id` is its swap's id). */
export async function listApprovedSwaps(ids: readonly string[]) {
	if (ids.length === 0) return [];
	return db
		.select({ id: swapRequest.id, payAsOt: swapRequest.payAsOt })
		.from(swapRequest)
		.where(and(inArray(swapRequest.id, [...ids]), eq(swapRequest.state, 'approved')));
}
