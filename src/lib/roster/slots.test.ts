import { describe, expect, it } from 'vitest';
import { MAX_CYCLE_DAYS } from './rules.js';
import {
	appendSlot,
	applyDrop,
	insertSlot,
	moveSlot,
	removeSlot,
	setSlot,
	swapSlots,
	type DropSource,
	type DropTarget
} from './slots.js';
import { letter, slots } from './test-shifts.js';

const codes = (s: readonly (string | null)[]) => s.map(letter).join(' ');
const shift = (shiftId: string | null): DropSource => ({ kind: 'shift', shiftId });
const day = (index: number): DropSource & DropTarget => ({ kind: 'slot', index });
const END: DropTarget = { kind: 'end' };
const BIN: DropTarget = { kind: 'bin' };
const WEEK = 'D N O O O D N';

describe('weekly drops', () => {
	it('sets a day from a shift, including off', () => {
		expect(codes(applyDrop(slots(WEEK), 'weekly', shift('E'), day(3)).slots)).toBe('D N O E O D N');
		expect(codes(applyDrop(slots(WEEK), 'weekly', shift(null), day(0)).slots)).toBe(
			'O N O O O D N'
		);
	});

	it('swaps two days', () => {
		expect(codes(applyDrop(slots(WEEK), 'weekly', day(1), day(5)).slots)).toBe('D D O O O N N');
	});

	it('ignores "+ add" and the bin, and keeps 7 days', () => {
		for (const target of [END, BIN]) {
			const result = applyDrop(slots(WEEK), 'weekly', shift('D'), target);
			expect(codes(result.slots)).toBe(WEEK);
			expect(applyDrop(slots(WEEK), 'weekly', day(2), target).slots).toHaveLength(7);
			expect(result.refused).toBeUndefined();
		}
	});
});

describe('cycle drops', () => {
	const CYCLE = 'D D N N O O';

	it('inserts a shift before a day: first, middle, last', () => {
		expect(codes(applyDrop(slots(CYCLE), 'cycle', shift('E'), day(0)).slots)).toBe('E D D N N O O');
		expect(codes(applyDrop(slots(CYCLE), 'cycle', shift('E'), day(2)).slots)).toBe('D D E N N O O');
		expect(codes(applyDrop(slots(CYCLE), 'cycle', shift(null), day(5)).slots)).toBe(
			'D D N N O O O'
		);
	});

	it('appends a shift on "+ add", up to 28 days', () => {
		expect(codes(applyDrop(slots(CYCLE), 'cycle', shift('N'), END).slots)).toBe('D D N N O O N');
		const full = Array<string | null>(MAX_CYCLE_DAYS - 1).fill(null);
		expect(applyDrop(full, 'cycle', shift('D'), END).slots).toHaveLength(MAX_CYCLE_DAYS);
	});

	it('refuses an insert or append at 28 days', () => {
		const full = Array<string | null>(MAX_CYCLE_DAYS).fill(null);
		for (const target of [day(3), END]) {
			const result = applyDrop(full, 'cycle', shift('D'), target);
			expect(result.refused).toBe('full');
			expect(result.slots).toHaveLength(MAX_CYCLE_DAYS);
		}
	});

	it('moves a day forwards, backwards and to the end', () => {
		const list = slots('D N E O');
		expect(codes(applyDrop(list, 'cycle', day(0), day(2)).slots)).toBe('N E D O');
		expect(codes(applyDrop(list, 'cycle', day(3), day(1)).slots)).toBe('D O N E');
		expect(codes(applyDrop(list, 'cycle', day(1), END).slots)).toBe('D E O N');
	});

	it('removes a day on the bin, down to one, then refuses', () => {
		let list = slots('D N');
		const first = applyDrop(list, 'cycle', day(0), BIN);
		expect(codes(first.slots)).toBe('N');
		list = first.slots;
		const last = applyDrop(list, 'cycle', day(0), BIN);
		expect(last.refused).toBe('last_day');
		expect(codes(last.slots)).toBe('N');
	});

	it('ignores a shift dropped on the bin', () => {
		expect(applyDrop(slots(CYCLE), 'cycle', shift('D'), BIN)).toEqual({ slots: slots(CYCLE) });
	});
});

describe('slot helpers', () => {
	it('leaves the slots alone on a same-index drop', () => {
		expect(codes(applyDrop(slots(WEEK), 'weekly', day(4), day(4)).slots)).toBe(WEEK);
		expect(codes(applyDrop(slots('D N O'), 'cycle', day(1), day(1)).slots)).toBe('D N O');
	});

	it('ignores out-of-range indices', () => {
		expect(codes(setSlot(slots('D N'), 5, 'E'))).toBe('D N');
		expect(codes(moveSlot(slots('D N'), 0, 9))).toBe('D N');
		expect(codes(swapSlots(slots('D N'), -1, 1))).toBe('D N');
		expect(removeSlot(slots('D N'), 2)).toEqual({ slots: slots('D N') });
	});

	it('never mutates its input', () => {
		const input = Object.freeze(slots('D N E O'));
		setSlot(input, 0, 'N');
		insertSlot(input, 1, 'D');
		appendSlot(input, 'D');
		moveSlot(input, 0, 3);
		swapSlots(input, 0, 3);
		removeSlot(input, 2);
		for (const source of [shift('D'), day(1)])
			for (const target of [day(2), END, BIN]) {
				applyDrop(input, 'cycle', source, target);
				applyDrop(input, 'weekly', source, target);
			}
		expect(codes(input)).toBe('D N E O');
	});

	it('returns a new array even when nothing changes', () => {
		const input = slots('D N');
		expect(setSlot(input, 0, 'D')).not.toBe(input);
		expect(applyDrop(input, 'weekly', shift('D'), BIN).slots).not.toBe(input);
	});
});
