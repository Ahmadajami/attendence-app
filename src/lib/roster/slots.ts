// Edits to a pattern's slots (shift id per day, `null` = off) for the pattern editor's taps and
// drag and drop. Every function returns a new array and never mutates its input. Client-safe.

import type { PatternType } from '#lib/schemas/enums.js';
import { MAX_CYCLE_DAYS } from './rules.js';

export type Slots = readonly (string | null)[];

/** What is dragged: a palette shift (`null` = off) or a day of the pattern. */
export type DropSource =
	{ kind: 'shift'; shiftId: string | null } | { kind: 'slot'; index: number };
/** Where it is dropped: a day, the "+ add" target after the last day, or the bin. */
export type DropTarget = { kind: 'slot'; index: number } | { kind: 'end' } | { kind: 'bin' };
/** `full`: the cycle already has 28 days. `last_day`: a cycle keeps at least one day. */
export type DropRefusal = 'full' | 'last_day';
export type DropResult = { slots: (string | null)[]; refused?: DropRefusal };

const inRange = (slots: Slots, index: number) =>
	Number.isInteger(index) && index >= 0 && index < slots.length;

/** Sets one day. */
export function setSlot(slots: Slots, index: number, shiftId: string | null): (string | null)[] {
	if (!inRange(slots, index) || slots[index] === shiftId) return [...slots];
	return slots.map((s, i) => (i === index ? shiftId : s));
}

/** Inserts a day before `index` (cycle). */
export function insertSlot(slots: Slots, index: number, shiftId: string | null): DropResult {
	if (slots.length >= MAX_CYCLE_DAYS) return { slots: [...slots], refused: 'full' };
	const at = Math.min(Math.max(index, 0), slots.length);
	return { slots: [...slots.slice(0, at), shiftId, ...slots.slice(at)] };
}

/** Adds a day after the last one (cycle). */
export function appendSlot(slots: Slots, shiftId: string | null): DropResult {
	return insertSlot(slots, slots.length, shiftId);
}

/** Moves the day at `from` so it ends up at `to` (cycle). */
export function moveSlot(slots: Slots, from: number, to: number): (string | null)[] {
	const next = [...slots];
	if (!inRange(slots, from) || !inRange(slots, to) || from === to) return next;
	next.splice(to, 0, ...next.splice(from, 1));
	return next;
}

/** Swaps two days (weekly). */
export function swapSlots(slots: Slots, a: number, b: number): (string | null)[] {
	const next = [...slots];
	if (!inRange(slots, a) || !inRange(slots, b) || a === b) return next;
	[next[a], next[b]] = [next[b], next[a]];
	return next;
}

/** Removes one day (cycle); the last day stays. */
export function removeSlot(slots: Slots, index: number): DropResult {
	if (!inRange(slots, index)) return { slots: [...slots] };
	if (slots.length <= 1) return { slots: [...slots], refused: 'last_day' };
	return { slots: slots.filter((_, i) => i !== index) };
}

/**
 * The editor's drop rules (mockup F2). Weekly: a shift on a day sets it, a day on a day swaps;
 * "+ add" and the bin don't apply. Cycle: a shift on a day is inserted before it, on "+ add" it
 * is appended; a day on a day or on "+ add" moves there, on the bin it is removed.
 */
export function applyDrop(
	slots: Slots,
	type: PatternType,
	source: DropSource,
	target: DropTarget
): DropResult {
	const unchanged = { slots: [...slots] };
	if (type === 'weekly') {
		if (target.kind !== 'slot') return unchanged;
		return source.kind === 'shift'
			? { slots: setSlot(slots, target.index, source.shiftId) }
			: { slots: swapSlots(slots, source.index, target.index) };
	}

	if (source.kind === 'shift') {
		if (target.kind === 'slot') return insertSlot(slots, target.index, source.shiftId);
		if (target.kind === 'end') return appendSlot(slots, source.shiftId);
		return unchanged;
	}
	if (target.kind === 'slot') return { slots: moveSlot(slots, source.index, target.index) };
	if (target.kind === 'end') return { slots: moveSlot(slots, source.index, slots.length - 1) };
	return removeSlot(slots, source.index);
}
