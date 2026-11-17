import { describe, expect, it } from 'vitest';
import { planLeaveDebit } from './credit-debit.js';

describe('planLeaveDebit', () => {
	it('B1.01 working day: 21 credit minutes / 660 scheduled minutes, unrounded', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: false,
			scheduledMinutes: 660,
			normalMinutes: 660,
			offDayOverrideMinutes: null
		});
		expect(result).toEqual({
			kind: 'ok',
			creditMinutes: 21,
			divisorMinutes: 660,
			dayFraction: 21 / 660,
			divisorSource: 'scheduled',
			inputs: {
				isOffDay: false,
				scheduledMinutes: 660,
				normalMinutes: 660,
				offDayOverrideMinutes: null
			}
		});
	});

	it('B1.02 different employee working day: 21 / 600', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: false,
			scheduledMinutes: 600,
			normalMinutes: 600,
			offDayOverrideMinutes: null
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(600);
		expect(result.dayFraction).toBe(21 / 600);
		expect(result.divisorSource).toBe('scheduled');
	});

	it('B1.03 off day with 0 scheduled minutes uses normal workday 660', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: 660,
			offDayOverrideMinutes: null
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(660);
		expect(result.dayFraction).toBe(21 / 660);
		expect(result.divisorSource).toBe('normal_workday');
	});

	it('B1.04 off day with explicit company override 480 uses the override', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: 660,
			offDayOverrideMinutes: 480
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(480);
		expect(result.dayFraction).toBe(21 / 480);
		expect(result.divisorSource).toBe('off_day_override');
	});

	it('B1.05 off-day override works even when normal workday minutes are unknown', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: null,
			offDayOverrideMinutes: 480
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(480);
		expect(result.dayFraction).toBe(21 / 480);
		expect(result.divisorSource).toBe('off_day_override');
	});

	it('B1.06 workday still uses scheduled 660 when an off-day override is present', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: false,
			scheduledMinutes: 660,
			normalMinutes: 600,
			offDayOverrideMinutes: 480
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(660);
		expect(result.dayFraction).toBe(21 / 660);
		expect(result.divisorSource).toBe('scheduled');
	});

	it('B1.07 missing normal duration without off-day override returns missing_divisor', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: null,
			offDayOverrideMinutes: null
		});
		expect(result).toEqual({ kind: 'error', code: 'missing_divisor' });
	});

	it('B1.07a omitted off-day override falls back to normal workday', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: 660
			// offDayOverrideMinutes omitted
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(660);
		expect(result.dayFraction).toBe(21 / 660);
		expect(result.divisorSource).toBe('normal_workday');
		expect(result.inputs.offDayOverrideMinutes).toBeNull();
	});

	it('B1.07b explicitly undefined off-day override falls back to normal workday', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: 660,
			offDayOverrideMinutes: undefined
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(660);
		expect(result.dayFraction).toBe(21 / 660);
		expect(result.divisorSource).toBe('normal_workday');
		expect(result.inputs.offDayOverrideMinutes).toBeNull();
	});

	it('B1.07c omitted off-day override with unknown normalMinutes returns missing_divisor', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: null
			// offDayOverrideMinutes omitted
		});
		expect(result).toEqual({ kind: 'error', code: 'missing_divisor' });
	});

	it('B1.07d explicitly undefined off-day override with unknown normalMinutes returns missing_divisor', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: null,
			offDayOverrideMinutes: undefined
		});
		expect(result).toEqual({ kind: 'error', code: 'missing_divisor' });
	});

	it('B1.08 zero normal duration without off-day override returns missing_divisor', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: 0,
			offDayOverrideMinutes: null
		});
		expect(result).toEqual({ kind: 'error', code: 'missing_divisor' });
	});

	it('B1.09 invalid off-day override is not replaced by normal hours', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: true,
			scheduledMinutes: 0,
			normalMinutes: 660,
			offDayOverrideMinutes: 0
		});
		expect(result).toEqual({ kind: 'error', code: 'invalid_divisor' });
	});

	it('B1.10 invalid credit minutes are rejected', () => {
		for (const creditMinutes of [0, -1, NaN, Infinity, -Infinity]) {
			const result = planLeaveDebit({
				creditMinutes,
				isOffDay: false,
				scheduledMinutes: 660,
				normalMinutes: 660,
				offDayOverrideMinutes: null
			});
			expect(result).toEqual({ kind: 'error', code: 'invalid_credit_minutes' });
		}
	});

	it('B1.11 invalid workday scheduled divisor is rejected', () => {
		for (const scheduledMinutes of [0, -1, NaN, Infinity, -Infinity]) {
			const result = planLeaveDebit({
				creditMinutes: 21,
				isOffDay: false,
				scheduledMinutes,
				normalMinutes: 660,
				offDayOverrideMinutes: null
			});
			expect(result).toEqual({ kind: 'error', code: 'invalid_divisor' });
		}
	});

	it('B1.12 invalid off-day override values are rejected', () => {
		for (const offDayOverrideMinutes of [-1, NaN, Infinity, -Infinity]) {
			const result = planLeaveDebit({
				creditMinutes: 21,
				isOffDay: true,
				scheduledMinutes: 0,
				normalMinutes: 660,
				offDayOverrideMinutes
			});
			expect(result).toEqual({ kind: 'error', code: 'invalid_divisor' });
		}
	});

	it('B1.13 unused off-day inputs do not change a valid workday result', () => {
		const result = planLeaveDebit({
			creditMinutes: 21,
			isOffDay: false,
			scheduledMinutes: 660,
			normalMinutes: null,
			offDayOverrideMinutes: 480
		});
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.divisorMinutes).toBe(660);
		expect(result.dayFraction).toBe(21 / 660);
		expect(result.divisorSource).toBe('scheduled');
		expect(result.inputs.normalMinutes).toBeNull();
		expect(result.inputs.offDayOverrideMinutes).toBe(480);
	});
});
