import { describe, expect, it } from 'vitest';
import { earliestEffectiveDate, MAX_BACKFILL_DAYS, withinBackdateLimit } from './backdate.js';
import { daysBetween } from './cycle.js';

describe('backdated changes (B7b)', () => {
	const today = '2026-11-09';

	it('reaches back MAX_BACKFILL_DAYS days, today included', () => {
		const earliest = earliestEffectiveDate(today);
		expect(daysBetween(earliest, today) + 1).toBe(MAX_BACKFILL_DAYS);
	});

	it('allows today, future dates and past dates inside the limit', () => {
		expect(withinBackdateLimit(today, today)).toBe(true);
		expect(withinBackdateLimit('2027-03-01', today)).toBe(true);
		expect(withinBackdateLimit('2026-09-01', today)).toBe(true);
		expect(withinBackdateLimit(earliestEffectiveDate(today), today)).toBe(true);
	});

	it('refuses the day before the earliest date', () => {
		const earliest = earliestEffectiveDate(today);
		const dayBefore = new Date(`${earliest}T00:00:00Z`);
		dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
		expect(withinBackdateLimit(dayBefore.toISOString().slice(0, 10), today)).toBe(false);
	});

	it('counts across a leap day', () => {
		expect(earliestEffectiveDate('2028-03-31')).toBe('2027-02-26');
	});
});
