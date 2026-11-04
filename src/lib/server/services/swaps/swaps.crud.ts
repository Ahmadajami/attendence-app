import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { SwapState } from '#lib/schemas/enums.js';
import { db } from '#lib/server/db/index.js';
import { rosterOverride, staff, swapRequest, team, user } from '#lib/server/db/schema/index.js';
import type { BatchQuery } from '../common.js';

// Swap requests (swaps plan §3; pay plan PR25–PR29). Writes return unexecuted queries, except
// `updateIfState`: it runs the state change and the writes that go with it in one transaction, and
// only when the request is still in the expected state (a double click or a stale tab decides once).

/** The approved swaps among these ids (an override's `swap_group_id` is its swap's id). */
export async function listApprovedSwaps(ids: readonly string[]) {
	if (ids.length === 0) return [];
	return db
		.select({ id: swapRequest.id, payAsOt: swapRequest.payAsOt })
		.from(swapRequest)
		.where(and(inArray(swapRequest.id, [...ids]), eq(swapRequest.state, 'approved')));
}

const personA = alias(staff, 'swap_person_a');
const personB = alias(staff, 'swap_person_b');
const requester = alias(user, 'swap_requester');
const decider = alias(user, 'swap_decider');
const canceller = alias(user, 'swap_canceller');

const swapColumns = {
	id: swapRequest.id,
	kind: swapRequest.kind,
	staffId: swapRequest.staffId,
	otherStaffId: swapRequest.otherStaffId,
	firstDate: swapRequest.firstDate,
	secondDate: swapRequest.secondDate,
	scope: swapRequest.scope,
	payAsOt: swapRequest.payAsOt,
	reason: swapRequest.reason,
	state: swapRequest.state,
	createdAt: swapRequest.createdAt,
	decidedAt: swapRequest.decidedAt,
	decisionNote: swapRequest.decisionNote,
	cancelledAt: swapRequest.cancelledAt,
	cancelReason: swapRequest.cancelReason,
	a: { employeeNo: personA.employeeNo, fullName: personA.fullName, fullNameAr: personA.fullNameAr },
	b: { employeeNo: personB.employeeNo, fullName: personB.fullName, fullNameAr: personB.fullNameAr },
	requestedBy: { fullName: requester.fullName, fullNameAr: requester.fullNameAr },
	decidedBy: { fullName: decider.fullName, fullNameAr: decider.fullNameAr },
	cancelledBy: { fullName: canceller.fullName, fullNameAr: canceller.fullNameAr }
};

const selectSwaps = () =>
	db
		.select(swapColumns)
		.from(swapRequest)
		.innerJoin(personA, eq(personA.id, swapRequest.staffId))
		.leftJoin(personB, eq(personB.id, swapRequest.otherStaffId))
		.leftJoin(requester, eq(requester.id, swapRequest.requestedBy))
		.leftJoin(decider, eq(decider.id, swapRequest.decidedBy))
		.leftJoin(canceller, eq(canceller.id, swapRequest.cancelledBy));

/** Either date of the request on dates `[from, to]`, and (when given) A or B is this person. */
function matching(from: string, to: string, staffId: string | null) {
	return and(
		or(
			and(gte(swapRequest.firstDate, from), lte(swapRequest.firstDate, to)),
			and(gte(swapRequest.secondDate, from), lte(swapRequest.secondDate, to))
		),
		staffId
			? or(eq(swapRequest.staffId, staffId), eq(swapRequest.otherStaffId, staffId))
			: undefined
	);
}

/** Requests in these states with a date on `[from, to]`, newest first date first. */
export async function listSwapRows(
	states: readonly SwapState[],
	from: string,
	to: string,
	staffId: string | null
) {
	return selectSwaps()
		.where(and(inArray(swapRequest.state, [...states]), matching(from, to, staffId)))
		.orderBy(desc(swapRequest.firstDate), desc(swapRequest.createdAt));
}

export type SwapRow = Awaited<ReturnType<typeof listSwapRows>>[number];

/** How many requests of each state the same filters find (the tab counts). */
export async function countSwapsByState(from: string, to: string, staffId: string | null) {
	const rows = await db
		.select({ state: swapRequest.state, count: sql<number>`count(*)::int` })
		.from(swapRequest)
		.where(matching(from, to, staffId))
		.groupBy(swapRequest.state);
	return new Map(rows.map((r) => [r.state, r.count]));
}

export async function findSwapRow(id: string): Promise<SwapRow | undefined> {
	const [row] = await selectSwaps().where(eq(swapRequest.id, id)).limit(1);
	return row;
}

/** Pending requests of these people with a date among `dates` (SW7: they may clash). */
export async function listPendingTouching(staffIds: readonly string[], dates: readonly string[]) {
	if (staffIds.length === 0 || dates.length === 0) return [];
	return db
		.select({
			id: swapRequest.id,
			kind: swapRequest.kind,
			staffId: swapRequest.staffId,
			otherStaffId: swapRequest.otherStaffId,
			firstDate: swapRequest.firstDate,
			secondDate: swapRequest.secondDate,
			scope: swapRequest.scope
		})
		.from(swapRequest)
		.where(
			and(
				eq(swapRequest.state, 'pending'),
				or(
					inArray(swapRequest.staffId, [...staffIds]),
					inArray(swapRequest.otherStaffId, [...staffIds])
				),
				or(inArray(swapRequest.firstDate, [...dates]), inArray(swapRequest.secondDate, [...dates]))
			)
		);
}

/** The overrides a swap created (cancelled ones too), by date. */
export async function listSwapOverrides(swapId: string) {
	return db
		.select({
			staffId: rosterOverride.staffId,
			shiftDate: rosterOverride.shiftDate,
			shiftId: rosterOverride.shiftId,
			cancelledAt: rosterOverride.cancelledAt
		})
		.from(rosterOverride)
		.where(eq(rosterOverride.swapGroupId, swapId))
		.orderBy(asc(rosterOverride.shiftDate));
}

/** Team names by id (the preview shows each person's team, Q-SW5). */
export async function listTeamNames(ids: readonly string[]) {
	if (ids.length === 0) return [];
	return db
		.select({ id: team.id, nameEn: team.nameEn, nameAr: team.nameAr })
		.from(team)
		.where(inArray(team.id, [...ids]));
}

export function insertSwap(values: typeof swapRequest.$inferInsert): BatchQuery {
	return db.insert(swapRequest).values(values);
}

export function insertSwapOverrides(values: (typeof rosterOverride.$inferInsert)[]): BatchQuery[] {
	return values.length > 0 ? [db.insert(rosterOverride).values(values)] : [];
}

/** Cancel every active override of a swap together (SW5). */
export function cancelSwapOverrides(swapId: string, cancelledBy: string): BatchQuery {
	return db
		.update(rosterOverride)
		.set({ cancelledAt: new Date(), cancelledBy })
		.where(and(eq(rosterOverride.swapGroupId, swapId), isNull(rosterOverride.cancelledAt)));
}

/**
 * Move a request from `expected` to its new state (`set`) and run `then` in the same transaction.
 * `false`, with nothing written, when the request is no longer in `expected`.
 */
export async function updateIfState(
	id: string,
	expected: SwapState,
	set: Partial<typeof swapRequest.$inferInsert>,
	then: readonly BatchQuery[]
): Promise<boolean> {
	return db.transaction(async (tx) => {
		const changed = await tx
			.update(swapRequest)
			.set(set)
			.where(and(eq(swapRequest.id, id), eq(swapRequest.state, expected)))
			.returning({ id: swapRequest.id });
		if (changed.length === 0) return false;
		for (const query of then) await tx.execute(query.getSQL());
		return true;
	});
}
