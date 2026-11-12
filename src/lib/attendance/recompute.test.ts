import { describe, expect, it } from 'vitest';
import type { DayResultValues } from './day-result.js';
import { dayResultHash } from './day-result.js';
import {
	dayKey,
	planRecompute,
	SYSTEM_CAUSE,
	type RecomputeCause,
	type StoredDay
} from './recompute.js';

// Made-up rows: only the fields the planner reads matter; the rest are fixed defaults.
const day = (staffId: string, shiftDate: string, over: Partial<DayResultValues> = {}) =>
	({
		staffId,
		shiftDate,
		kind: 'work',
		status: 'done',
		source: 'team',
		patternId: 'p1',
		shiftId: 'D',
		teamId: 't1',
		holidayId: null,
		absenceType: null,
		checkIn: '2026-11-03T04:00:00.000Z',
		checkOut: '2026-11-03T16:00:00.000Z',
		checkInSource: 'manual',
		checkOutSource: 'manual',
		corrected: false,
		requiredMinutes: 720,
		workedMinutes: 720,
		creditMinutes: 0,
		shortageMinutes: 0,
		creditExtraMinutes: 0,
		lateMinutes: 0,
		overtimeMinutes: 0,
		otRate: null,
		paidOtMinutes: 0,
		unpaidExtraMinutes: 0,
		unpaidReason: null,
		swapRequestId: null,
		swapRole: null,
		unauthSwap: false,
		explanation: {},
		...over
	}) satisfies DayResultValues;

const stored = (values: DayResultValues, needsRecompute = false): [string, StoredDay] => [
	dayKey(values.staffId, values.shiftDate),
	{ values, hash: dayResultHash(values), needsRecompute }
];

const typed: RecomputeCause = {
	source: 'correction',
	causeType: 'event',
	causeId: 'ev-9',
	actorId: 'u-1'
};

describe('planRecompute', () => {
	it('keeps unchanged rows, writes new, changed and flagged ones', () => {
		const same = day('s1', '2026-11-03');
		const flagged = day('s2', '2026-11-03');
		const before = day('s3', '2026-11-03');
		const after = day('s3', '2026-11-03', {
			checkOut: '2026-11-03T17:15:00.000Z',
			workedMinutes: 795,
			overtimeMinutes: 75,
			otRate: 1.25,
			paidOtMinutes: 75,
			corrected: true
		});
		const fresh = day('s4', '2026-11-03');

		const plan = planRecompute(
			new Map([stored(same), stored(flagged, true), stored(before)]),
			[same, flagged, after, fresh],
			typed
		);

		expect(plan.kept).toBe(1);
		expect(plan.write.map((w) => w.values.staffId)).toEqual(['s2', 's3', 's4']);
		// The flagged row is rewritten only to clear its flag: no log line for it.
		expect(plan.logs.filter((l) => l.staffId === 's2')).toEqual([]);
		// The changed row: one line per changed value, with the cause.
		expect(plan.logs.filter((l) => l.staffId === 's3').map((l) => l.field)).toEqual([
			'check_out',
			'worked',
			'overtime',
			'ot_rate',
			'paid_ot'
		]);
		expect(plan.logs.find((l) => l.field === 'worked')).toMatchObject({
			oldValue: 720,
			newValue: 795,
			source: 'correction',
			causeType: 'event',
			causeId: 'ev-9',
			actorId: 'u-1',
			shiftDate: '2026-11-03'
		});
		// A day computed the first time: one "created" line.
		expect(plan.logs.filter((l) => l.staffId === 's4')).toEqual([
			expect.objectContaining({ field: 'created', newValue: 'work', source: 'correction' })
		]);
	});

	it('takes a cause per person and date', () => {
		const plan = planRecompute(
			new Map(),
			[day('s1', '2026-11-03'), day('s2', '2026-11-03')],
			(s) => (s === 's1' ? typed : SYSTEM_CAUSE)
		);
		expect(plan.logs.map((l) => [l.staffId, l.source])).toEqual([
			['s1', 'correction'],
			['s2', 'system']
		]);
	});

	it('writes nothing when every row is already right', () => {
		const rows = [day('s1', '2026-11-03'), day('s1', '2026-11-04')];
		const plan = planRecompute(new Map(rows.map((r) => stored(r))), rows, SYSTEM_CAUSE);
		expect(plan).toEqual({ write: [], logs: [], kept: 2 });
	});
});
