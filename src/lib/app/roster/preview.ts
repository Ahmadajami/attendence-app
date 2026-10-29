import { parseDate } from '@internationalized/date';
import type { ResolvedPathname } from '$app/types';
import { rosterRange, type RosterAssignment, type RosterDay } from '#lib/roster/roster.js';
import { rosterInputOf } from '#lib/roster/input.js';
import { applyVersionChange } from '#lib/roster/versions.js';
import type { PatternType } from '#lib/schemas/enums.js';
import type { RosterPreviewData } from '#lib/server/services/roster/roster.bl.js';

/** One line of the roster preview grid. */
export type PreviewRow = {
	id: string;
	label: string;
	href?: ResolvedPathname;
	days: RosterDay[];
};

/** An unsaved pattern version, applied on top of the saved ones for a live preview. */
export type DraftVersion =
	| { owner: 'team'; teamId: string; version: RosterAssignment }
	| { owner: 'personal'; staffId: string; version: RosterAssignment };

/** A real `YYYY-MM-DD` date. */
export function isCalendarDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	try {
		parseDate(value);
		return true;
	} catch {
		return false;
	}
}

/** Id of the unsaved version in a preview (no saved row has it). */
const DRAFT_ID = 'draft';

/** The version the editor would save, or `null` while the editor is incomplete. */
export function draftVersion(
	draft: {
		type: PatternType;
		slots: (string | null)[];
		anchorDate: string;
		effectiveFrom: string;
	},
	teamId: string | null
): RosterAssignment | null {
	const cycle = draft.type === 'cycle';
	if (
		(cycle && !isCalendarDate(draft.anchorDate)) ||
		(!cycle && draft.slots.length !== 7) ||
		!isCalendarDate(draft.effectiveFrom) ||
		!draft.slots.some((slot) => slot !== null)
	)
		return null;
	return {
		id: DRAFT_ID,
		patternId: DRAFT_ID,
		teamId,
		departmentId: null,
		type: draft.type,
		slots: draft.slots,
		defaultWorkShiftId: null,
		anchorDate: cycle ? draft.anchorDate : null,
		effectiveFrom: draft.effectiveFrom,
		effectiveTo: null
	};
}

/** One person's preview days, with the draft (if any) applied to their team's or own versions. */
export function previewDays(
	data: RosterPreviewData,
	staffId: string,
	draft: DraftVersion | null
): RosterDay[] {
	const input = rosterInputOf(data, staffId);
	if (draft?.owner === 'personal' && draft.staffId === staffId) {
		input.personalAssignments = applyVersionChange(input.personalAssignments, draft.version);
	} else if (draft?.owner === 'team') {
		input.teamAssignments = [
			...input.teamAssignments.filter((p) => p.teamId !== draft.teamId),
			...applyVersionChange(
				input.teamAssignments.filter((p) => p.teamId === draft.teamId),
				draft.version
			)
		];
	}
	return rosterRange(input, data.from, data.days);
}

/**
 * Starting values of the pattern editor: the version in force today (or the last one), else a
 * `cycle` of the first two active shifts and two days off (D N O O with the seeded shifts).
 */
export function patternFormDefaults(
	current: Pick<RosterAssignment, 'type' | 'slots' | 'anchorDate'> | undefined,
	today: string,
	shifts: readonly { id: string; active: boolean }[]
) {
	const active = shifts.filter((s) => s.active).map((s) => s.id);
	return {
		type: current?.type ?? ('cycle' as const),
		slots: current?.slots ?? [active[0] ?? null, active[1] ?? active[0] ?? null, null, null],
		anchorDate: current?.anchorDate ?? today,
		effectiveFrom: today,
		reason: ''
	};
}
