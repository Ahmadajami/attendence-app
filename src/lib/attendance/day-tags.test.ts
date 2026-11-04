import { describe, expect, it } from 'vitest';
import { DAY_STATUSES } from '#lib/schemas/enums.js';
import {
	DAY_TAG_GROUPS,
	DAY_TAG_TONE,
	dayTags,
	overtimeTags,
	statusTag,
	type DayTagFigures
} from './day-tags.js';

const day = (over: Partial<DayTagFigures> = {}): DayTagFigures => ({
	status: 'done',
	absenceType: null,
	holidayId: null,
	swapRequestId: null,
	swapRole: null,
	unauthSwap: false,
	corrected: false,
	lateMinutes: 0,
	...over
});

const ids = (f: DayTagFigures, grace = 0, flagged = false) =>
	dayTags(f, grace, flagged).map((t) => t.id);

describe('statusTag', () => {
	it('has a tag for every status but absent', () => {
		for (const status of DAY_STATUSES.filter((s) => s !== 'absent')) {
			expect(statusTag({ status, absenceType: null }).id).toBe(`status.${status}`);
		}
	});

	it('shows the day state instead of "absent" (DT7)', () => {
		expect(statusTag({ status: 'absent', absenceType: 'leave' }).id).toBe('state.leave');
		expect(statusTag({ status: 'absent', absenceType: 'sick' }).id).toBe('state.sick');
		expect(statusTag({ status: 'absent', absenceType: 'no_show' }).id).toBe('state.no_show');
		expect(statusTag({ status: 'absent', absenceType: 'mission' }).id).toBe('state.mission');
		expect(statusTag({ status: 'absent', absenceType: null }).id).toBe('state.other');
	});
});

describe('dayTags', () => {
	it('is the status alone on a plain day', () => {
		expect(ids(day())).toEqual(['status.done']);
	});

	it('shows a state once on an absent day', () => {
		expect(ids(day({ status: 'absent', absenceType: 'sick' }))).toEqual(['state.sick']);
	});

	it('adds the late mark on a finished day beyond the grace only (DT8)', () => {
		expect(ids(day({ lateMinutes: 5 }), 5)).toEqual(['status.done']);
		expect(dayTags(day({ lateMinutes: 12 }), 5)).toEqual([
			{ id: 'status.done' },
			{ id: 'mark.late', minutes: 12 }
		]);
		expect(ids(day({ status: 'on_break', lateMinutes: 12 }), 5)).toEqual([
			'status.on_break',
			'mark.late'
		]);
	});

	it('does not repeat lateness on a Late status', () => {
		expect(ids(day({ status: 'late', lateMinutes: 30 }), 5)).toEqual(['status.late']);
	});

	it('keeps a fixed order of marks', () => {
		expect(
			ids(
				day({
					holidayId: 'h',
					swapRole: 'swap_on',
					unauthSwap: true,
					corrected: true,
					lateMinutes: 20
				}),
				0,
				true
			)
		).toEqual([
			'status.done',
			'mark.late',
			'mark.holiday',
			'mark.swap_on',
			'mark.unauth_swap',
			'mark.corrected',
			'mark.flagged'
		]);
	});

	it('shows a holiday with a state', () => {
		expect(ids(day({ status: 'absent', absenceType: 'leave', holidayId: 'h' }))).toEqual([
			'state.leave',
			'mark.holiday'
		]);
	});

	it('shows swap off', () => {
		expect(ids(day({ status: 'off', swapRole: 'swap_off' }))).toEqual([
			'status.off',
			'mark.swap_off'
		]);
	});

	it('the swap tag carries its swap, for "Open the swap" (SW9)', () => {
		const tags = dayTags(day({ swapRequestId: 's-1', swapRole: 'swap_on' }), 0);
		expect(tags.find((t) => t.id === 'mark.swap_on')?.swapId).toBe('s-1');
	});
});

describe('overtimeTags', () => {
	it('lists paid and unpaid time with their figures', () => {
		expect(
			overtimeTags({
				paidOtMinutes: 90,
				otRate: 1.5,
				unpaidExtraMinutes: 40,
				unpaidReason: 'ot_off'
			})
		).toEqual([
			{ id: 'ot.paid', minutes: 90, rate: 1.5 },
			{ id: 'ot.unpaid', minutes: 40, reason: 'ot_off' }
		]);
	});

	it('is empty without overtime', () => {
		expect(
			overtimeTags({ paidOtMinutes: 0, otRate: null, unpaidExtraMinutes: 0, unpaidReason: null })
		).toEqual([]);
	});
});

describe('the catalogue', () => {
	it('lists every tag once in the guide, each with a tone', () => {
		const listed = DAY_TAG_GROUPS.flatMap((g) => [...g.tags]);
		expect(new Set(listed).size).toBe(listed.length);
		expect(listed.sort()).toEqual(Object.keys(DAY_TAG_TONE).sort());
	});
});
