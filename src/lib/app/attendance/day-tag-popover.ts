import { getContext, setContext } from 'svelte';
import type { DayTag } from '#lib/attendance/day-tags.js';

// The shared explanation popover of a table's day tags (DT5): one popover per table, every tag a
// button that asks it to open beside itself.

export type DayTagPopoverApi = {
	/** Open the popover for `tag` beside `anchor`, or close it when it is already open there. */
	toggle(tag: DayTag, anchor: HTMLElement): void;
};

const KEY = Symbol('day-tag-popover');

/** Called by `DayTagPopover` while it initialises. */
export const setDayTagPopover = (api: DayTagPopoverApi): DayTagPopoverApi => setContext(KEY, api);

/** The surrounding popover, or `undefined` when a tag is shown outside one (then it is plain). */
export const getDayTagPopover = (): DayTagPopoverApi | undefined =>
	getContext<DayTagPopoverApi | undefined>(KEY);
