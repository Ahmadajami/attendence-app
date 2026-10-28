import { parseDate } from '@internationalized/date';
import type { ResolvedPathname } from '$app/types';
import { rosterRange, type RosterDay, type RosterPattern } from '#lib/roster/roster.js';
import { applyVersionChange } from '#lib/roster/versions.js';
import type { ShiftKind } from '#lib/schemas/enums.js';
import type { ShiftStarts } from '#lib/schemas/settings.schema.js';
import type { RosterPreviewData } from '#lib/server/services/roster/roster.bl.js';

/** One line of the roster preview grid. */
export type PreviewRow = {
	id: string;
	label: string;
	href?: ResolvedPathname;
	days: RosterDay[];
};

/** An unsaved cycle version, applied on top of the saved ones for a live preview. */
export type DraftVersion =
	| { owner: 'team'; teamId: string; version: RosterPattern }
	| { owner: 'personal'; staffId: string; version: RosterPattern };

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

/** The version the editor would save, or `null` while the editor is incomplete. */
export function draftVersion(
	draft: { cycle: ShiftKind[]; anchorDate: string; effectiveFrom: string },
	shiftStarts: ShiftStarts | null,
	teamId: string | null
): RosterPattern | null {
	if (
		!shiftStarts ||
		!isCalendarDate(draft.anchorDate) ||
		!isCalendarDate(draft.effectiveFrom) ||
		!draft.cycle.some((kind) => kind !== 'off')
	)
		return null;
	return {
		teamId,
		cycle: draft.cycle,
		anchorDate: draft.anchorDate,
		dayStart: shiftStarts.day,
		nightStart: shiftStarts.night,
		effectiveFrom: draft.effectiveFrom,
		effectiveTo: null
	};
}

/** One person's preview days, with the draft (if any) applied to their team's or own versions. */
export function previewDays(
	data: RosterPreviewData,
	staffId: string,
	shiftStarts: ShiftStarts | null,
	draft: DraftVersion | null
): RosterDay[] {
	let personalPatterns: RosterPattern[] = data.personalPatterns.filter(
		(p) => p.staffId === staffId
	);
	let teamPatterns: RosterPattern[] = data.teamPatterns;
	if (draft?.owner === 'personal' && draft.staffId === staffId) {
		personalPatterns = applyVersionChange(personalPatterns, draft.version);
	} else if (draft?.owner === 'team') {
		teamPatterns = [
			...teamPatterns.filter((p) => p.teamId !== draft.teamId),
			...applyVersionChange(
				teamPatterns.filter((p) => p.teamId === draft.teamId),
				draft.version
			)
		];
	}
	return rosterRange(
		{
			memberships: data.memberships.filter((m) => m.staffId === staffId),
			personalPatterns,
			teamPatterns,
			overrides: data.overrides.filter((o) => o.staffId === staffId),
			absences: data.absences.filter((a) => a.staffId === staffId),
			fallbackTimes: shiftStarts
				? { dayStart: shiftStarts.day, nightStart: shiftStarts.night }
				: null
		},
		data.from,
		data.days
	);
}
