import { describe, expect, it } from 'vitest';
import { dailyRange, pastDays } from './daily-range.js';

const today = '2026-11-03';

describe('dailyRange', () => {
	it('defaults to the last 7 days ending today', () => {
		expect(dailyRange(null, null, today)).toEqual({ from: '2026-10-28', to: today });
	});

	it('defaults From to six days before a given To', () => {
		expect(dailyRange(null, '2026-10-10', today)).toEqual({ from: '2026-10-04', to: '2026-10-10' });
	});

	it('keeps a long range as asked', () => {
		expect(dailyRange('2026-01-01', today, today)).toEqual({ from: '2026-01-01', to: today });
	});

	it('keeps future dates and an inverted range as asked', () => {
		expect(dailyRange('2026-11-20', '2026-11-10', today)).toEqual({
			from: '2026-11-20',
			to: '2026-11-10'
		});
	});
});

describe('pastDays', () => {
	it('counts both ends', () => {
		expect(pastDays('2026-10-01', '2026-10-31', today)).toBe(31);
	});

	it('stops at today', () => {
		expect(pastDays('2026-11-01', '2026-11-30', today)).toBe(3);
	});

	it('is 0 for a future or inverted range', () => {
		expect(pastDays('2026-11-10', '2026-11-20', today)).toBe(0);
		expect(pastDays('2026-10-20', '2026-10-10', today)).toBe(0);
	});
});
