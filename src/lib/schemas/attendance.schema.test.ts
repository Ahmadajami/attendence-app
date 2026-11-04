import { describe, expect, it } from 'vitest';
import { dayPunchesSchema } from './attendance.schema.js';

const valid = {
	staffId: '00000000-0000-4000-8000-000000000001',
	shiftDate: '2026-10-05',
	shiftId: '00000000-0000-4000-8000-000000000002',
	checkIn: '07:00',
	checkOut: '15:00',
	reason: 'Forgot to punch'
};

const fails = (over: Partial<typeof valid>, field: keyof typeof valid) => {
	const result = dayPunchesSchema.safeParse({ ...valid, ...over });
	expect(result.success).toBe(false);
	expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
};

describe('dayPunchesSchema (PR46–PR48)', () => {
	it('accepts a check-in and check-out with a reason', () => {
		expect(dayPunchesSchema.safeParse(valid).success).toBe(true);
	});

	it('accepts an empty check-out (an open pair, or removing it)', () => {
		expect(dayPunchesSchema.parse({ ...valid, checkOut: '' }).checkOut).toBe('');
	});

	it('requires the check-in', () => {
		fails({ checkIn: '' }, 'checkIn');
	});

	it('refuses a time that is not HH:mm', () => {
		fails({ checkIn: '7:00' }, 'checkIn');
		fails({ checkOut: '24:00' }, 'checkOut');
	});

	it('requires a reason (PR48)', () => {
		fails({ reason: '   ' }, 'reason');
	});

	it('requires a shift', () => {
		fails({ shiftId: '' }, 'shiftId');
	});
});
