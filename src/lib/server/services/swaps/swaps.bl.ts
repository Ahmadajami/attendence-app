import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import { addDays, daysBetween } from '#lib/roster/cycle.js';
import { rosterInputOf } from '#lib/roster/input.js';
import { rosterDay, type RosterDay } from '#lib/roster/roster.js';
import { appliedMoves, swapMoves, type SwapMove } from '#lib/roster/swap-moves.js';
import { swapIssueText } from '#lib/roster/swap-labels.js';
import {
	checkSwap,
	swapDates,
	swapOverrides,
	type SwapIssue,
	type SwapPlan
} from '#lib/roster/swaps.js';
import type { RosterSource, SwapState } from '#lib/schemas/enums.js';
import type {
	SwapCancelInput,
	SwapDecisionInput,
	SwapFormInput,
	SwapPreviewInput
} from '#lib/schemas/swap.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { listEntryPeople, type EntryPersonRow } from '../attendance/attendance.crud.js';
import { causeBy, markNeedsRecompute, recomputeAfter } from '../day-results/day-results.bl.js';
import { loadRosterData, type RosterPreviewData } from '../roster/roster.bl.js';
import {
	cancelSwapOverrides,
	countSwapsByState,
	findSwapRow,
	insertSwap,
	insertSwapOverrides,
	listPendingTouching,
	listSwapOverrides,
	listSwapRows,
	listTeamNames,
	updateIfState,
	type SwapRow
} from './swaps.crud.js';

// Swap requests, from request to roster (swaps plan SW1–SW11; pay plan PR25–PR29). Creating needs
// `attendance.record`; approving, rejecting and cancelling need `roster.manage` (PR29). Approving
// re-checks the days, writes the swap's one-off shifts (`swap_group_id` = the request id) and
// recomputes both people's days (source and cause `swap`); cancelling an approved swap cancels its
// shifts together. Audit rows hold ids, dates, kind, scope and state only, never the reason or the
// note (SW8).

export type { SwapRow };

/** The page's tabs (SW1). */
export const SWAP_TABS = ['pending', 'approved', 'closed'] as const;
export type SwapTab = (typeof SWAP_TABS)[number];

const TAB_STATES: Record<SwapTab, SwapState[]> = {
	pending: ['pending'],
	approved: ['approved'],
	closed: ['rejected', 'cancelled']
};

const key = (staffId: string, date: string) => `${staffId}:${date}`;

type SwapDays = {
	people: EntryPersonRow[];
	/** Each person's day on each date, A first. */
	days: { staffId: string; day: RosterDay }[];
	dayOf: (staffId: string, date: string) => RosterDay | undefined;
	active: Set<string>;
};

/** Both people's roster days on the swap's dates, as they are now. */
async function loadSwapDays(plan: SwapPlan): Promise<SwapDays> {
	const people = await listEntryPeople([
		plan.staffId,
		...(plan.otherStaffId ? [plan.otherStaffId] : [])
	]);
	const dates = [...new Set([plan.firstDate, ...(plan.secondDate ? [plan.secondDate] : [])])];
	// One date at a time: the two dates may be far apart until the scope check refuses them.
	const rosters = await Promise.all(dates.map((date) => loadRosterData(people, date, 1)));
	const order = peopleOf(plan);
	const sorted = [...people].sort((a, b) => order.indexOf(a.staffId) - order.indexOf(b.staffId));
	const days = sorted.flatMap((p) =>
		dates.map((date, i) => ({
			staffId: p.staffId,
			day: rosterDay(rosterInputOf(rosters[i], p.staffId), date)
		}))
	);
	const byKey = new Map(days.map((d) => [key(d.staffId, d.day.date), d.day]));
	return {
		people: sorted,
		days,
		dayOf: (staffId, date) => byKey.get(key(staffId, date)),
		active: new Set(people.filter((p) => p.active).map((p) => p.staffId))
	};
}

const planOf = (row: {
	kind: SwapPlan['kind'];
	staffId: string;
	otherStaffId: string | null | '';
	firstDate: string;
	secondDate: string | null | '';
	scope: SwapPlan['scope'];
}): SwapPlan => ({
	kind: row.kind,
	staffId: row.staffId,
	otherStaffId: row.kind === 'emp_swap' && row.otherStaffId ? row.otherStaffId : null,
	firstDate: row.firstDate,
	secondDate: row.secondDate || null,
	scope: row.scope
});

/** The first and last date of a swap. */
function spanOf(plan: SwapPlan): { from: string; to: string } {
	const dates = [plan.firstDate, ...(plan.secondDate ? [plan.secondDate] : [])].sort();
	return { from: dates[0], to: dates[dates.length - 1] };
}

const peopleOf = (plan: SwapPlan) => [
	plan.staffId,
	...(plan.otherStaffId ? [plan.otherStaffId] : [])
];

/** Other pending requests touching the same person and date (SW7: a warning, not a refusal). */
async function clashesOf(plan: SwapPlan, exceptId: string | null): Promise<number> {
	const touched = new Set(swapDates(plan).map((d) => key(d.staffId, d.date)));
	const dates = [plan.firstDate, ...(plan.secondDate ? [plan.secondDate] : [])];
	const pending = await listPendingTouching(peopleOf(plan), dates);
	return pending.filter(
		(p) =>
			p.id !== exceptId && swapDates(planOf(p)).some((d) => touched.has(key(d.staffId, d.date)))
	).length;
}

const blocked = (issues: readonly SwapIssue[], scope: SwapPlan['scope']) =>
	new ConflictError(
		'swap_blocked',
		m.swap_error_blocked({
			issues: issues.map((i) => swapIssueText(i, scope)).join(m.list_separator())
		})
	);

/** A person on a swap, with their team on the first date (Q-SW5). */
export type SwapPerson = {
	staffId: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	team: { nameEn: string; nameAr: string } | null;
};

/** One person's day on one date of the swap, as the roster has it now. */
export type SwapPreviewDay = {
	staffId: string;
	date: string;
	shiftId: string | null;
	source: RosterSource;
	holiday: boolean;
};

export type SwapPreview = {
	issues: SwapIssue[];
	moves: SwapMove[];
	people: SwapPerson[];
	days: SwapPreviewDay[];
	/** Other pending requests on the same person and date (SW7). */
	clashes: number;
};

async function previewOf(plan: SwapPlan, loaded: SwapDays, exceptId: string | null) {
	const teamIds = [
		...new Set(loaded.people.flatMap((p) => loaded.dayOf(p.staffId, plan.firstDate)?.teamId ?? []))
	];
	const [teams, clashes] = await Promise.all([listTeamNames(teamIds), clashesOf(plan, exceptId)]);
	const teamOf = new Map(teams.map((t) => [t.id, { nameEn: t.nameEn, nameAr: t.nameAr }]));
	return {
		people: loaded.people.map((p) => {
			const teamId = loaded.dayOf(p.staffId, plan.firstDate)?.teamId ?? null;
			return {
				staffId: p.staffId,
				employeeNo: p.employeeNo,
				fullName: p.fullName,
				fullNameAr: p.fullNameAr,
				team: teamId ? (teamOf.get(teamId) ?? null) : null
			};
		}),
		days: loaded.days.map(({ staffId, day }) => ({
			staffId,
			date: day.date,
			shiftId: day.shiftId,
			source: day.source,
			holiday: day.holiday !== null
		})),
		clashes
	};
}

/**
 * The live preview of the New swap sheet (SW2): each person's day on each date, what the swap would
 * make of it, and why it can't apply. `null` until the form names the people and the first date.
 */
export async function previewSwap(
	actor: Actor,
	input: SwapPreviewInput
): Promise<SwapPreview | null> {
	requireActorPermission(actor, 'attendance.record');
	if (!input.staffId || !input.firstDate) return null;
	if (input.kind === 'emp_swap' && (!input.otherStaffId || input.otherStaffId === input.staffId))
		return null;
	const plan = planOf(input);
	const loaded = await loadSwapDays(plan);
	if (loaded.people.length === 0) return null;
	return {
		issues: checkSwap(plan, loaded.dayOf, loaded.active),
		moves: swapMoves(plan, loaded.dayOf, loaded.active),
		...(await previewOf(plan, loaded, null))
	};
}

const auditAfter = (plan: SwapPlan, payAsOt: boolean, state: SwapState) => ({
	kind: plan.kind,
	staffId: plan.staffId,
	otherStaffId: plan.otherStaffId,
	firstDate: plan.firstDate,
	secondDate: plan.secondDate,
	scope: plan.scope,
	payAsOt,
	state
});

/** The writes that apply an approved swap: its one-off shifts and the stored days' flags. */
function applyWrites(
	actor: Actor,
	id: string,
	plan: SwapPlan,
	reason: string,
	loaded: SwapDays
): BatchQuery[] {
	const { from, to } = spanOf(plan);
	return [
		...insertSwapOverrides(
			swapOverrides(plan, loaded.dayOf).map((o) => ({
				staffId: o.staffId,
				shiftDate: o.shiftDate,
				shiftId: o.shiftId,
				reason,
				swapGroupId: id,
				createdBy: actor.user.id
			}))
		),
		...markNeedsRecompute(peopleOf(plan), from, to)
	];
}

/** Run a batch; a clash on the one-active-override-per-day index means the roster changed meanwhile. */
async function guarded<T>(write: () => Promise<T>): Promise<T> {
	try {
		return await write();
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('swap_changed', m.swap_error_changed(), { cause: error });
		throw error;
	}
}

async function recomputeSwap(actor: Actor, id: string, plan: SwapPlan): Promise<void> {
	const { from, to } = spanOf(plan);
	await recomputeAfter(peopleOf(plan), from, to, causeBy(actor, 'swap', 'swap', id));
}

/**
 * Save a request (SW2). Refused while the swap can't apply (the same check as the preview). With
 * `approve` (SW3, needs `roster.manage`) it is approved in the same step: one transaction, two
 * audit rows.
 */
export async function createSwap(
	actor: Actor,
	input: SwapFormInput
): Promise<{ id: string; state: SwapState }> {
	requireActorPermission(actor, 'attendance.record');
	if (input.approve) requireActorPermission(actor, 'roster.manage');
	const plan = planOf(input);
	const loaded = await loadSwapDays(plan);
	if (loaded.people.length < peopleOf(plan).length)
		throw new NotFoundError(m.attendance_error_person());
	const issues = checkSwap(plan, loaded.dayOf, loaded.active);
	if (issues.length > 0) throw blocked(issues, plan.scope);

	const id = randomUUID();
	const now = new Date();
	const state: SwapState = input.approve ? 'approved' : 'pending';
	const request = {
		id,
		kind: plan.kind,
		staffId: plan.staffId,
		otherStaffId: plan.otherStaffId,
		firstDate: plan.firstDate,
		secondDate: plan.secondDate,
		scope: plan.scope,
		payAsOt: input.payAsOt,
		reason: input.reason,
		requestedBy: actor.user.id
	};
	const requested = auditInsert({
		actor: actor.user,
		action: 'swap.request',
		entityType: 'swap_request',
		entityId: id,
		after: auditAfter(plan, input.payAsOt, 'pending')
	});
	if (!input.approve) {
		await batch([insertSwap(request), requested]);
		return { id, state };
	}
	await guarded(() =>
		batch([
			insertSwap({ ...request, state, decidedBy: actor.user.id, decidedAt: now }),
			requested,
			...applyWrites(actor, id, plan, input.reason, loaded),
			auditInsert({
				actor: actor.user,
				action: 'swap.approve',
				entityType: 'swap_request',
				entityId: id,
				before: { state: 'pending' },
				after: auditAfter(plan, input.payAsOt, state)
			})
		])
	);
	await recomputeSwap(actor, id, plan);
	return { id, state };
}

async function requireSwap(id: string): Promise<SwapRow> {
	const row = await findSwapRow(id);
	if (!row) throw new NotFoundError(m.swap_error_not_found());
	return row;
}

const notPending = () => new ConflictError('swap_not_pending', m.swap_error_not_pending());

/** Approve (optional note) or reject (note required) a pending request (SW4, SW5). */
export async function decideSwap(
	actor: Actor,
	input: SwapDecisionInput
): Promise<{ state: SwapState }> {
	requireActorPermission(actor, 'roster.manage');
	const row = await requireSwap(input.id);
	if (row.state !== 'pending') throw notPending();
	const plan = planOf(row);
	const decided = {
		decidedBy: actor.user.id,
		decidedAt: new Date(),
		decisionNote: input.note || null
	};

	if (input.decision === 'reject') {
		const done = await updateIfState(row.id, 'pending', { ...decided, state: 'rejected' }, [
			auditInsert({
				actor: actor.user,
				action: 'swap.reject',
				entityType: 'swap_request',
				entityId: row.id,
				before: { state: 'pending' },
				after: auditAfter(plan, row.payAsOt, 'rejected')
			})
		]);
		if (!done) throw notPending();
		return { state: 'rejected' };
	}

	// Re-checked now (PR27): the roster may have changed since the request was made.
	const loaded = await loadSwapDays(plan);
	const issues = checkSwap(plan, loaded.dayOf, loaded.active, row.id);
	if (issues.length > 0) throw blocked(issues, plan.scope);
	const done = await guarded(() =>
		updateIfState(row.id, 'pending', { ...decided, state: 'approved' }, [
			...applyWrites(actor, row.id, plan, row.reason, loaded),
			auditInsert({
				actor: actor.user,
				action: 'swap.approve',
				entityType: 'swap_request',
				entityId: row.id,
				before: { state: 'pending' },
				after: auditAfter(plan, row.payAsOt, 'approved')
			})
		])
	);
	if (!done) throw notPending();
	await recomputeSwap(actor, row.id, plan);
	return { state: 'approved' };
}

/**
 * Withdraw a pending request, or undo an approved one: its one-off shifts are cancelled together and
 * the days recomputed (SW5). Rejected and cancelled requests stay as they are.
 */
export async function cancelSwap(actor: Actor, input: SwapCancelInput): Promise<void> {
	requireActorPermission(actor, 'roster.manage');
	const row = await requireSwap(input.id);
	if (row.state !== 'pending' && row.state !== 'approved')
		throw new ConflictError('swap_closed', m.swap_error_closed());
	const plan = planOf(row);
	const { from, to } = spanOf(plan);
	const applied = row.state === 'approved';
	const done = await updateIfState(
		row.id,
		row.state,
		{
			state: 'cancelled',
			cancelledBy: actor.user.id,
			cancelledAt: new Date(),
			cancelReason: input.reason
		},
		[
			...(applied
				? [
						cancelSwapOverrides(row.id, actor.user.id),
						...markNeedsRecompute(peopleOf(plan), from, to)
					]
				: []),
			auditInsert({
				actor: actor.user,
				action: 'swap.cancel',
				entityType: 'swap_request',
				entityId: row.id,
				before: { state: row.state },
				after: auditAfter(plan, row.payAsOt, 'cancelled')
			})
		]
	);
	if (!done) throw new ConflictError('swap_changed', m.swap_error_changed());
	if (applied) await recomputeSwap(actor, row.id, plan);
}

export type SwapFilter = { tab: SwapTab; month: string; staffId: string | null };

export type SwapList = {
	rows: SwapRow[];
	/** Requests per tab with the same month and person. */
	counts: Record<SwapTab, number>;
};

/** `yyyy-mm` → its first and last date. */
export function monthRange(month: string): { from: string; to: string } {
	const from = `${month}-01`;
	const next = addDays(from, 32).slice(0, 7);
	return { from, to: addDays(`${next}-01`, -1) };
}

/** The requests of a tab with a date in the month, of one person if given (SW1). */
export async function listSwaps(actor: Actor, filter: SwapFilter): Promise<SwapList> {
	requireActorPermission(actor, 'attendance.record');
	const { from, to } = monthRange(filter.month);
	const [rows, byState] = await Promise.all([
		listSwapRows(TAB_STATES[filter.tab], from, to, filter.staffId),
		countSwapsByState(from, to, filter.staffId)
	]);
	const count = (tab: SwapTab) =>
		TAB_STATES[tab].reduce((sum, state) => sum + (byState.get(state) ?? 0), 0);
	return {
		rows,
		counts: { pending: count('pending'), approved: count('approved'), closed: count('closed') }
	};
}

export type SwapDetail = SwapPreview & {
	swap: SwapRow;
	/** The moves are the saved one-off shifts (approved, or cancelled after approval). */
	applied: boolean;
};

/**
 * One request with what it does: the saved one-off shifts once approved (also after a cancel),
 * otherwise what it would do now and why it can't (a pending one).
 */
export async function getSwap(actor: Actor, id: string): Promise<SwapDetail> {
	requireActorPermission(actor, 'attendance.record');
	const row = await requireSwap(id);
	const plan = planOf(row);
	const [loaded, overrides] = await Promise.all([loadSwapDays(plan), listSwapOverrides(row.id)]);
	const preview = await previewOf(plan, loaded, row.id);
	if (overrides.length > 0)
		return {
			swap: row,
			applied: true,
			issues: [],
			moves: appliedMoves(
				overrides,
				(staffId, date) => loaded.dayOf(staffId, date)?.plannedShiftId ?? null
			),
			...preview,
			clashes: 0
		};
	const pending = row.state === 'pending';
	return {
		swap: row,
		applied: false,
		issues: pending ? checkSwap(plan, loaded.dayOf, loaded.active, row.id) : [],
		moves: pending ? swapMoves(plan, loaded.dayOf, loaded.active) : [],
		...preview,
		clashes: pending ? preview.clashes : 0
	};
}

/** A person of the New swap page's roster grid. */
export type SwapRosterPerson = Omit<SwapPerson, 'team'>;

export type SwapRoster = { people: SwapRosterPerson[]; roster: RosterPreviewData };

/**
 * A and B's roster over a month, for the New swap page's grid: who works and who is off on each
 * day (the browser computes the days from it, like the roster preview). A first.
 */
export async function getSwapRoster(
	actor: Actor,
	staffIds: readonly string[],
	month: string
): Promise<SwapRoster> {
	requireActorPermission(actor, 'attendance.record');
	const order = [...new Set(staffIds)];
	const people = (await listEntryPeople(order)).sort(
		(a, b) => order.indexOf(a.staffId) - order.indexOf(b.staffId)
	);
	const { from, to } = monthRange(month);
	const roster = await loadRosterData(people, from, daysBetween(from, to) + 1);
	return {
		people: people.map((p) => ({
			staffId: p.staffId,
			employeeNo: p.employeeNo,
			fullName: p.fullName,
			fullNameAr: p.fullNameAr
		})),
		roster
	};
}

/** `?staff=…` on the New swap page (SW9): the person picked on the employee page, for its label. */
export async function getSwapPerson(actor: Actor, staffId: string) {
	requireActorPermission(actor, 'attendance.record');
	const [person] = await listEntryPeople([staffId]);
	return person
		? {
				staffId: person.staffId,
				employeeNo: person.employeeNo,
				fullName: person.fullName,
				fullNameAr: person.fullNameAr
			}
		: null;
}

/** Today in Damascus, `yyyy-mm` (the page's default month). */
export const thisMonth = () => todayInDamascus().slice(0, 7);

/** `?month=yyyy-mm`; anything else: this month. */
export function parseMonth(value: string | null): string {
	return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : thisMonth();
}
