import { describe, expect, it } from 'vitest';
import { planMembershipBackdate, startOfDayIn, type MembershipRow } from './membership-backdate.js';

const TZ = 'Asia/Damascus';
const importAt = new Date('2030-03-12T07:15:00.000Z');
const row = (id: string, staffId: string, validTo: Date | null = null): MembershipRow => ({
	id,
	staffId,
	validFrom: importAt,
	validTo
});

describe('startOfDayIn (RO4)', () => {
	it('is 00:00 in the zone (UTC+3 in Damascus)', () => {
		expect(startOfDayIn('2030-02-01', TZ)?.toISOString()).toBe('2030-01-31T21:00:00.000Z');
	});

	it('refuses impossible days and other formats', () => {
		expect(startOfDayIn('2030-02-30', TZ)).toBeNull();
		expect(startOfDayIn('2030-2-1', TZ)).toBeNull();
		expect(startOfDayIn('01/02/2030', TZ)).toBeNull();
		expect(startOfDayIn('', TZ)).toBeNull();
	});
});

describe('planMembershipBackdate (RO4)', () => {
	const from = startOfDayIn('2030-02-01', TZ)!;

	it('moves each imported person’s single open membership to the date', () => {
		const plan = planMembershipBackdate(
			[row('m1', 'a'), row('m2', 'b')],
			new Set(['a', 'b']),
			from
		);
		expect(plan.moves).toEqual([
			{ id: 'm1', staffId: 'a', before: importAt, after: from },
			{ id: 'm2', staffId: 'b', before: importAt, after: from }
		]);
		expect(plan).toMatchObject({ unchanged: 0, refused: [], currentStarts: 1 });
	});

	it('ignores people the import did not create', () => {
		const plan = planMembershipBackdate([row('m1', 'a'), row('m2', 'x')], new Set(['a']), from);
		expect(plan.moves.map((m) => m.id)).toEqual(['m1']);
	});

	it('refuses a person with another membership row, or a closed one', () => {
		const plan = planMembershipBackdate(
			[row('m1', 'a', importAt), row('m2', 'a'), row('m3', 'b', new Date('2030-03-20'))],
			new Set(['a', 'b']),
			from
		);
		expect(plan.moves).toEqual([]);
		expect(plan.refused).toEqual([
			{ staffId: 'a', reason: 'other_membership' },
			{ staffId: 'b', reason: 'closed' }
		]);
	});

	it('is unchanged on a re-run and moves the same rows again to an older date', () => {
		const moved = { ...row('m1', 'a'), validFrom: from };
		expect(planMembershipBackdate([moved], new Set(['a']), from)).toMatchObject({
			moves: [],
			unchanged: 1
		});
		const older = startOfDayIn('2030-01-01', TZ)!;
		expect(planMembershipBackdate([moved], new Set(['a']), older).moves).toEqual([
			{ id: 'm1', staffId: 'a', before: from, after: older }
		]);
	});

	it('refuses a date later than the current start', () => {
		const later = startOfDayIn('2030-04-01', TZ)!;
		expect(planMembershipBackdate([row('m1', 'a')], new Set(['a']), later).refused).toEqual([
			{ staffId: 'a', reason: 'later_than_current' }
		]);
	});
});
