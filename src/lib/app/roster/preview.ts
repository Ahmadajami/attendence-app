import type { ResolvedPathname } from '$app/types';
import { rosterInputOf } from '#lib/roster/input.js';
import { rosterRange, type RosterDay } from '#lib/roster/roster.js';
import type { RosterPreviewData } from '#lib/server/services/roster/roster.bl.js';

/** One line of the roster preview grid. */
export type PreviewRow = {
	id: string;
	label: string;
	href?: ResolvedPathname;
	days: RosterDay[];
};

/** One person's preview days. */
export function previewDays(data: RosterPreviewData, staffId: string): RosterDay[] {
	return rosterRange(rosterInputOf(data, staffId), data.from, data.days);
}
