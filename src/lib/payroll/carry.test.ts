import { describe, expect, it } from 'vitest';
import { carryPaySettings } from './carry.js';

// Made-up versions and holidays (CLAUDE.md §1).
const version = (id: string, effectiveFrom: string, effectiveTo: string | null) => ({
	id,
	effectiveFrom,
	effectiveTo
});
const holiday = (
	id: string,
	startsOn: string,
	endsOn: string,
	cancelledAt: Date | null = null
) => ({
	id,
	startsOn,
	endsOn,
	cancelledAt
});

describe('carryPaySettings', () => {
	const from = '2026-12-10';

	it('keeps the version in force, moved to start on the date, and later ones as they are', () => {
		const carried = carryPaySettings(
			[
				version('old', '2026-10-01', '2026-11-01'),
				version('now', '2026-11-01', '2026-12-20'),
				version('next', '2026-12-20', null)
			],
			[],
			from
		);
		expect(carried.versions).toEqual([
			version('now', '2026-12-10', '2026-12-20'),
			version('next', '2026-12-20', null)
		]);
	});

	it('drops a version that ends on the date (its end is exclusive)', () => {
		expect(carryPaySettings([version('ends', '2026-11-01', from)], [], from).versions).toEqual([]);
	});

	it('keeps active holidays not yet over, clipped to start on the date', () => {
		const carried = carryPaySettings(
			[],
			[
				holiday('past', '2026-11-01', '2026-11-02'),
				holiday('across', '2026-12-08', '2026-12-11'),
				holiday('ends-on-date', '2026-12-09', from),
				holiday('later', '2026-12-24', '2026-12-25'),
				holiday('cancelled', '2026-12-24', '2026-12-25', new Date('2026-11-05T10:00:00Z'))
			],
			from
		);
		expect(carried.holidays.map((h) => [h.id, h.startsOn, h.endsOn])).toEqual([
			['across', '2026-12-10', '2026-12-11'],
			['ends-on-date', '2026-12-10', '2026-12-10'],
			['later', '2026-12-24', '2026-12-25']
		]);
	});

	it('carries nothing from a pattern without settings', () => {
		expect(carryPaySettings([], [], from)).toEqual({ versions: [], holidays: [] });
	});
});
