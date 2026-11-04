import type {
	AbsenceType,
	DayStatus,
	PunchSource,
	SwapRole,
	UnpaidReason
} from '#lib/schemas/enums.js';
import type { DayFigures } from './day-result.js';

// The tags of a stored day (plans/2026-11-03-day-tags-colour-guide.md, DT1): every tag id, its
// group, its tone, and which tags a day shows. Pure: no Svelte, no messages. The labels and texts
// live in `#lib/app/attendance/day-tag-labels.ts`, the colours in `day-tag-tones.ts`.

/** The status tags. `absent` has none: the day state's tag stands in for it (DT7). */
export const STATUS_TAGS = [
	'status.expected',
	'status.present',
	'status.late',
	'status.on_break',
	'status.done',
	'status.missing',
	'status.off',
	'status.unscheduled'
] as const;

export const STATE_TAGS = [
	'state.leave',
	'state.sick',
	'state.no_show',
	'state.mission',
	'state.other'
] as const;

export const MARK_TAGS = [
	'mark.holiday',
	'mark.late',
	'mark.swap_on',
	'mark.swap_off',
	'mark.unauth_swap',
	'mark.corrected',
	'mark.flagged'
] as const;

export const SOURCE_TAGS = [
	'source.typed',
	'source.punch_reading',
	'source.odoo_seed',
	'source.next_day'
] as const;

export const OVERTIME_TAGS = ['ot.paid', 'ot.unpaid'] as const;

export type DayTagId =
	| (typeof STATUS_TAGS)[number]
	| (typeof STATE_TAGS)[number]
	| (typeof MARK_TAGS)[number]
	| (typeof SOURCE_TAGS)[number]
	| (typeof OVERTIME_TAGS)[number];

/** The colour guide's groups, in order (DT9). */
export const DAY_TAG_GROUPS = [
	{ group: 'status', tags: STATUS_TAGS },
	{ group: 'state', tags: STATE_TAGS },
	{ group: 'mark', tags: MARK_TAGS },
	{ group: 'source', tags: SOURCE_TAGS },
	{ group: 'overtime', tags: OVERTIME_TAGS }
] as const;

export type DayTagGroup = (typeof DAY_TAG_GROUPS)[number]['group'];

/** One meaning, one colour (§2). `neutral`: grey, no colour. */
export type DayTagTone =
	'ok' | 'attention' | 'problem' | 'leave' | 'sick' | 'mission' | 'holiday' | 'info' | 'neutral';

export const DAY_TAG_TONE: Record<DayTagId, DayTagTone> = {
	'status.expected': 'neutral',
	'status.present': 'ok',
	'status.late': 'attention',
	'status.on_break': 'info',
	'status.done': 'ok',
	'status.missing': 'problem',
	'status.off': 'neutral',
	'status.unscheduled': 'info',
	'state.leave': 'leave',
	'state.sick': 'sick',
	'state.no_show': 'problem',
	'state.mission': 'mission',
	'state.other': 'neutral',
	'mark.holiday': 'holiday',
	'mark.late': 'attention',
	'mark.swap_on': 'info',
	'mark.swap_off': 'info',
	'mark.unauth_swap': 'problem',
	'mark.corrected': 'info',
	'mark.flagged': 'attention',
	'source.typed': 'neutral',
	'source.punch_reading': 'neutral',
	'source.odoo_seed': 'neutral',
	'source.next_day': 'neutral',
	'ot.paid': 'ok',
	'ot.unpaid': 'neutral'
};

/** One tag as shown: its id and, for some, the figures its label and explanation need. */
export type DayTag = {
	id: DayTagId;
	/** Late minutes (`mark.late`) or overtime minutes (`ot.*`). */
	minutes?: number;
	/** The paid overtime rate (`ot.paid`). */
	rate?: number | null;
	/** Why extra time was not paid (`ot.unpaid`). */
	reason?: UnpaidReason | null;
	/** The approved swap behind the day (`mark.swap_*`), for "Open the swap" (swaps plan SW9). */
	swapId?: string;
};

export const STATE_TAG: Record<AbsenceType, DayTagId> = {
	leave: 'state.leave',
	sick: 'state.sick',
	no_show: 'state.no_show',
	mission: 'state.mission',
	other: 'state.other'
};

export const PUNCH_SOURCE_TAG: Record<PunchSource, DayTagId> = {
	manual: 'source.typed',
	import: 'source.punch_reading',
	seed: 'source.odoo_seed'
};

const SWAP_TAG: Record<SwapRole, DayTagId> = {
	swap_on: 'mark.swap_on',
	swap_off: 'mark.swap_off'
};

/** Statuses with a check-in that the Late status no longer shows (DT8). */
const LATE_HIDDEN: readonly DayStatus[] = ['done', 'on_break'];

export type DayTagFigures = Pick<
	DayFigures,
	| 'status'
	| 'absenceType'
	| 'holidayId'
	| 'swapRequestId'
	| 'swapRole'
	| 'unauthSwap'
	| 'corrected'
	| 'lateMinutes'
>;

/**
 * The tag of the Status column: the status, or the day state's tag when the status is `absent`
 * (DT7; `other` if the state is unknown).
 */
export function statusTag(figures: Pick<DayFigures, 'status' | 'absenceType'>): DayTag {
	if (figures.status === 'absent') return { id: STATE_TAG[figures.absenceType ?? 'other'] };
	return { id: `status.${figures.status}` };
}

/**
 * The tags of a stored day's Status column, in a fixed order: status (or state), the day state
 * when the status is not `absent`, Late on a finished day beyond `graceMinutes` (DT8), Holiday,
 * Swap, Unauthorised swap, Corrected, and Waiting for recompute when `flagged`.
 */
export function dayTags(figures: DayTagFigures, graceMinutes: number, flagged = false): DayTag[] {
	const tags: DayTag[] = [statusTag(figures)];
	if (figures.status !== 'absent' && figures.absenceType) {
		tags.push({ id: STATE_TAG[figures.absenceType] });
	}
	if (LATE_HIDDEN.includes(figures.status) && figures.lateMinutes > graceMinutes) {
		tags.push({ id: 'mark.late', minutes: figures.lateMinutes });
	}
	if (figures.holidayId) tags.push({ id: 'mark.holiday' });
	if (figures.swapRole)
		tags.push({
			id: SWAP_TAG[figures.swapRole],
			...(figures.swapRequestId ? { swapId: figures.swapRequestId } : {})
		});
	if (figures.unauthSwap) tags.push({ id: 'mark.unauth_swap' });
	if (figures.corrected) tags.push({ id: 'mark.corrected' });
	if (flagged) tags.push({ id: 'mark.flagged' });
	return tags;
}

/** The overtime tags of a day: paid at its rate, and / or not paid with the reason. */
export function overtimeTags(
	figures: Pick<DayFigures, 'paidOtMinutes' | 'otRate' | 'unpaidExtraMinutes' | 'unpaidReason'>
): DayTag[] {
	const tags: DayTag[] = [];
	if (figures.paidOtMinutes > 0) {
		tags.push({ id: 'ot.paid', minutes: figures.paidOtMinutes, rate: figures.otRate });
	}
	if (figures.unpaidExtraMinutes > 0) {
		tags.push({
			id: 'ot.unpaid',
			minutes: figures.unpaidExtraMinutes,
			reason: figures.unpaidReason
		});
	}
	return tags;
}
