import { describe, expect, it } from 'vitest';
import { planClear } from './day-state.js';

// Made-up absence rows of one made-up person.
const row = (id: string, startsOn: string, endsOn: string) => ({ id, startsOn, endsOn });

describe('planClear', () => {
	it('cancels a row inside the range and keeps nothing', () => {
		const plan = planClear([row('a', '2026-03-02', '2026-03-03')], '2026-03-01', '2026-03-05');
		expect(plan.cancel.map((r) => r.id)).toEqual(['a']);
		expect(plan.keep).toEqual([]);
	});

	it('keeps the parts before and after the range of a longer row', () => {
		const plan = planClear([row('a', '2026-03-01', '2026-03-10')], '2026-03-04', '2026-03-05');
		expect(plan.cancel.map((r) => r.id)).toEqual(['a']);
		expect(plan.keep.map(({ startsOn, endsOn }) => [startsOn, endsOn])).toEqual([
			['2026-03-01', '2026-03-03'],
			['2026-03-06', '2026-03-10']
		]);
	});

	it('keeps one side when the row starts or ends inside the range', () => {
		const plan = planClear(
			[row('a', '2026-02-27', '2026-03-02'), row('b', '2026-03-05', '2026-03-08')],
			'2026-03-01',
			'2026-03-06'
		);
		expect(plan.cancel.map((r) => r.id)).toEqual(['a', 'b']);
		expect(plan.keep.map(({ startsOn, endsOn, from }) => [from.id, startsOn, endsOn])).toEqual([
			['a', '2026-02-27', '2026-02-28'],
			['b', '2026-03-07', '2026-03-08']
		]);
	});

	it('ignores rows outside the range', () => {
		const plan = planClear([row('a', '2026-03-10', '2026-03-12')], '2026-03-01', '2026-03-09');
		expect(plan).toEqual({ cancel: [], keep: [] });
	});

	it('clears a single day out of a single-day row', () => {
		const plan = planClear([row('a', '2026-03-04', '2026-03-04')], '2026-03-04', '2026-03-04');
		expect(plan.cancel).toHaveLength(1);
		expect(plan.keep).toEqual([]);
	});
});
