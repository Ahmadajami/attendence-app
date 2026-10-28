import { describe, expect, it } from 'vitest';
import { applyVersionChange, planVersionChange } from './versions.js';

const v = (id: string, effectiveFrom: string, effectiveTo: string | null = null) => ({
	id,
	effectiveFrom,
	effectiveTo
});

describe('planVersionChange', () => {
	it('closes the open version at the new start', () => {
		const current = v('a', '2026-10-01');
		expect(planVersionChange([current], '2026-11-02')).toEqual({ closed: current, removed: [] });
	});

	it('closes the version in force and removes scheduled ones after it', () => {
		const past = v('a', '2026-09-01', '2026-10-01');
		const current = v('b', '2026-10-01', '2026-12-01');
		const scheduled = v('c', '2026-12-01');
		expect(planVersionChange([past, current, scheduled], '2026-11-02')).toEqual({
			closed: current,
			removed: [scheduled]
		});
	});

	it('replaces a version that starts on the same date', () => {
		const current = v('a', '2026-10-01', '2026-11-02');
		const scheduled = v('b', '2026-11-02');
		expect(planVersionChange([current, scheduled], '2026-11-02')).toEqual({
			closed: null,
			removed: [scheduled]
		});
	});

	it('does nothing for an owner without versions', () => {
		expect(planVersionChange([], '2026-11-02')).toEqual({ closed: null, removed: [] });
	});
});

describe('applyVersionChange', () => {
	it('leaves past versions alone and adds the new open one', () => {
		const past = v('a', '2026-09-01', '2026-10-01');
		const current = v('b', '2026-10-01');
		const next = v('new', '2026-11-02');
		expect(applyVersionChange([past, current], next)).toEqual([
			past,
			{ ...current, effectiveTo: '2026-11-02' },
			next
		]);
	});
});
