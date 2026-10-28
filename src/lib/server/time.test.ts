import { describe, expect, it } from 'vitest';
import { damascusDayOf, damascusDayRange, parseDamascusDateTime } from './time.js';

// Damascus has been UTC+3 all year since 2022, so wall-clock 07:00 is 04:00Z.

describe('parseDamascusDateTime', () => {
	it('reads ISO-style wall-clock time as Damascus time', () => {
		expect(parseDamascusDateTime('2026-11-05 07:00')?.toISOString()).toBe(
			'2026-11-05T04:00:00.000Z'
		);
		expect(parseDamascusDateTime('2026-11-05T19:30:15')?.toISOString()).toBe(
			'2026-11-05T16:30:15.000Z'
		);
	});

	it('reads day-first dates and Arabic-Indic digits', () => {
		expect(parseDamascusDateTime('5/11/2026 07:00')?.toISOString()).toBe(
			'2026-11-05T04:00:00.000Z'
		);
		expect(parseDamascusDateTime('٠٥/١١/٢٠٢٦ ٠٧:٠٠')?.toISOString()).toBe(
			'2026-11-05T04:00:00.000Z'
		);
	});

	it('keeps an explicit instant as given', () => {
		expect(parseDamascusDateTime('2026-11-05T07:00:00Z')?.toISOString()).toBe(
			'2026-11-05T07:00:00.000Z'
		);
		expect(parseDamascusDateTime('2026-11-05T07:00:00+03:00')?.toISOString()).toBe(
			'2026-11-05T04:00:00.000Z'
		);
	});

	it('returns null for impossible or unknown values', () => {
		expect(parseDamascusDateTime('2026-02-30 07:00')).toBeNull();
		expect(parseDamascusDateTime('2026-11-05 25:00')).toBeNull();
		expect(parseDamascusDateTime('2026-11-05')).toBeNull();
		expect(parseDamascusDateTime('tomorrow')).toBeNull();
	});
});

describe('damascusDayOf', () => {
	it('uses the Damascus date, not the UTC one', () => {
		expect(damascusDayOf(new Date('2026-11-05T20:59:00Z'))).toBe('2026-11-05');
		expect(damascusDayOf(new Date('2026-11-05T21:00:00Z'))).toBe('2026-11-06');
	});
});

describe('damascusDayRange', () => {
	it('spans Damascus midnight to midnight', () => {
		const range = damascusDayRange('2026-11-05');
		expect(range.day).toBe('2026-11-05');
		expect(range.start.toISOString()).toBe('2026-11-04T21:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-11-05T21:00:00.000Z');
	});

	it('crosses a month end', () => {
		const range = damascusDayRange('2026-10-31');
		expect(range.end.toISOString()).toBe('2026-10-31T21:00:00.000Z');
		expect(damascusDayOf(range.end)).toBe('2026-11-01');
	});

	it('falls back to today for a missing or impossible day', () => {
		const today = damascusDayOf(new Date());
		expect(damascusDayRange().day).toBe(today);
		expect(damascusDayRange('2026-02-30').day).toBe(today);
	});
});
