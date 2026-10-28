import { describe, expect, it } from 'vitest';
import { shiftFormSchema } from './shift.schema.js';

const valid = {
	shiftId: '',
	code: 'N2',
	nameEn: 'Night two',
	nameAr: 'ليلي ٢',
	colour: '#4338ca',
	startTime: '19:00',
	endTime: '07:00',
	breakMinutes: 0,
	requiredMinutes: null,
	windowBeforeMinutes: 180,
	windowAfterMinutes: 360,
	graceMinutes: 0
};

const issues = (patch: Partial<typeof valid> | Record<string, unknown>) => {
	const result = shiftFormSchema.safeParse({ ...valid, ...patch });
	return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('shiftFormSchema', () => {
	it('accepts a valid shift (code N2)', () => {
		expect(issues({})).toEqual([]);
	});

	it('refuses the reserved code OFF, lower case and more than 3 characters', () => {
		expect(issues({ code: 'OFF' })).toEqual(['code']);
		expect(issues({ code: 'ab' })).toEqual(['code']);
		expect(issues({ code: 'ABCD' })).toEqual(['code']);
		expect(issues({ code: '' })).toEqual(['code']);
	});

	it('checks times, minutes and the palette', () => {
		expect(issues({ startTime: '24:00' })).toEqual(['startTime']);
		expect(issues({ breakMinutes: 721 })).toEqual(['breakMinutes']);
		expect(issues({ requiredMinutes: 0 })).toEqual(['requiredMinutes']);
		expect(issues({ graceMinutes: 121 })).toEqual(['graceMinutes']);
		expect(issues({ colour: '#ffffff' })).toEqual(['colour']);
	});
});
