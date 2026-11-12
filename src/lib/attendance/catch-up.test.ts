import { describe, expect, it } from 'vitest';
import { catchUpRanges } from './catch-up.js';

// Made-up people: ids only.
const A = 'person-a';
const B = 'person-b';
const C = 'person-c';

describe('catchUpRanges', () => {
	it('has nothing to do without flagged days', () => {
		expect(catchUpRanges([])).toEqual([]);
	});

	it('recomputes people flagged on the same day together', () => {
		expect(
			catchUpRanges([
				{ staffId: A, shiftDate: '2026-10-05' },
				{ staffId: B, shiftDate: '2026-10-05' },
				{ staffId: C, shiftDate: '2026-10-05' }
			])
		).toEqual([{ from: '2026-10-05', to: '2026-10-05', staffIds: [A, B, C] }]);
	});

	it("spans a person's first to last flagged date", () => {
		expect(
			catchUpRanges([
				{ staffId: A, shiftDate: '2026-10-09' },
				{ staffId: A, shiftDate: '2026-10-03' },
				{ staffId: A, shiftDate: '2026-10-05' }
			])
		).toEqual([{ from: '2026-10-03', to: '2026-10-09', staffIds: [A] }]);
	});

	it('keeps different ranges apart, oldest first', () => {
		expect(
			catchUpRanges([
				{ staffId: A, shiftDate: '2026-10-07' },
				{ staffId: B, shiftDate: '2026-10-01' },
				{ staffId: B, shiftDate: '2026-10-02' },
				{ staffId: C, shiftDate: '2026-10-07' },
				{ staffId: A, shiftDate: '2026-10-07' }
			])
		).toEqual([
			{ from: '2026-10-01', to: '2026-10-02', staffIds: [B] },
			{ from: '2026-10-07', to: '2026-10-07', staffIds: [A, C] }
		]);
	});

	it('covers every flagged person exactly once', () => {
		const flagged = Array.from({ length: 300 }, (_, i) => ({
			staffId: `person-${i}`,
			shiftDate: i % 2 === 0 ? '2026-10-01' : '2026-10-02'
		}));
		const ranges = catchUpRanges(flagged);
		expect(ranges).toHaveLength(2);
		expect(new Set(ranges.flatMap((r) => r.staffIds)).size).toBe(300);
	});
});
