import { describe, expect, it } from 'vitest';
import { addDays } from '#lib/roster/cycle.js';
import {
	OPERATION_HOLIDAY,
	OPERATION_MONTHS,
	OPERATION_PEOPLE,
	OPERATION_SLOTS,
	buildOperationSeed,
	monthOn,
	plannedShift,
	type SeedPair
} from './operation-seed.js';

const NOW = new Date('2026-11-03T12:00:00Z');
const seed = buildOperationSeed({ now: NOW });
const MAX_PAIR_MS = 16 * 60 * 60_000;

const monthKey = (p: SeedPair) => monthOn(p.shiftDate)?.key;

describe('Operation cycle and crew starts', () => {
	it('has the production shape: 24 slots, 12 work', () => {
		expect(OPERATION_SLOTS).toHaveLength(24);
		expect(OPERATION_SLOTS.filter((s) => s !== null)).toHaveLength(12);
	});

	it('November follows production: crew start 13 is off on the 1st and on D8 on the 4th', () => {
		const person = OPERATION_MONTHS[2].crewStarts.indexOf(13);
		expect(plannedShift(person, '2026-11-01')).toBeNull();
		expect(plannedShift(person, '2026-11-04')).toBe('D8');
	});

	it('each month restarts the cycle on its 1st (no own rule = slot 0 = N8)', () => {
		for (const month of OPERATION_MONTHS) {
			const person = month.crewStarts.indexOf(null);
			expect(plannedShift(person, month.anchor)).toBe('N8');
		}
	});

	it('gives every teammate a different crew start, and changes each person every month', () => {
		for (const month of OPERATION_MONTHS)
			expect(new Set(month.crewStarts.map((c) => c ?? 0)).size).toBe(OPERATION_PEOPLE);
		for (let person = 0; person < OPERATION_PEOPLE; person++) {
			const values = OPERATION_MONTHS.map((m) => m.crewStarts[person] ?? 0);
			expect(new Set(values).size).toBe(OPERATION_MONTHS.length);
		}
	});
});

describe('buildOperationSeed', () => {
	it('only covers September and October', () => {
		for (const p of seed.pairs) expect(['Sep', 'Oct']).toContain(monthKey(p));
	});

	it('punches each pair on the planned shift, except the one extra shift', () => {
		const extra = seed.pairs.filter((p) => p.kind === 'extra_shift');
		expect(extra).toHaveLength(1);
		expect(plannedShift(extra[0].person, extra[0].shiftDate)).toBeNull();
		expect(extra[0].reason).toBeTruthy();
		for (const p of seed.pairs.filter((p) => p.kind !== 'extra_shift'))
			expect(p.shift).toBe(plannedShift(p.person, p.shiftDate));
	});

	it('has no pair in the future, longer than 16 h, or overlapping another of the same person', () => {
		const byPerson = Map.groupBy(seed.pairs, (p) => p.person);
		for (const pairs of byPerson.values()) {
			const sorted = [...pairs].sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
			sorted.forEach((p, i) => {
				expect(p.checkIn.getTime()).toBeLessThanOrEqual(NOW.getTime());
				if (p.checkOut) {
					expect(p.checkOut.getTime()).toBeGreaterThan(p.checkIn.getTime());
					expect(p.checkOut.getTime() - p.checkIn.getTime()).toBeLessThanOrEqual(MAX_PAIR_MS);
				}
				const next = sorted[i + 1];
				if (next && p.checkOut) expect(p.checkOut.getTime()).toBeLessThan(next.checkIn.getTime());
			});
		}
	});

	it('puts a night check-out on the next morning', () => {
		const night = seed.pairs.find((p) => p.shift === 'N8' && p.checkOut)!;
		expect(night.checkOut!.getTime() - night.checkIn.getTime()).toBeGreaterThan(10 * 60 * 60_000);
	});

	it('places the agreed mix of cases', () => {
		const count = (kind: SeedPair['kind'], key?: string) =>
			seed.pairs.filter((p) => p.kind === kind && (!key || monthKey(p) === key)).length;
		for (const key of ['Sep', 'Oct']) {
			expect(count('late', key)).toBe(2 * OPERATION_PEOPLE);
			expect(count('early_leave', key)).toBe(OPERATION_PEOPLE);
			expect(count('overtime', key)).toBe(2 * OPERATION_PEOPLE);
		}
		expect(count('missing_out')).toBe(2);
		expect(count('holiday_work')).toBe(1);
		expect(seed.noShows).toHaveLength(2);
		expect(seed.absences.map((a) => a.type).sort()).toEqual(['leave', 'sick']);
	});

	it('leaves absences, no-shows and the holiday (except its one worker) without punches', () => {
		const punched = new Set(seed.pairs.map((p) => `${p.person}|${p.shiftDate}`));
		for (const a of seed.absences)
			for (let d = a.startsOn; d <= a.endsOn; d = addDays(d, 1))
				expect(punched.has(`${a.person}|${d}`)).toBe(false);
		for (const n of seed.noShows) expect(punched.has(`${n.person}|${n.date}`)).toBe(false);
		expect(seed.pairs.filter((p) => p.shiftDate === OPERATION_HOLIDAY)).toHaveLength(1);
	});

	it('gives the same rows for the same seed, and a subset for a narrower range', () => {
		const again = buildOperationSeed({ now: NOW });
		expect(again).toEqual(seed);
		const october = buildOperationSeed({ now: NOW, from: '2026-10-01' });
		expect(october.pairs).toEqual(seed.pairs.filter((p) => p.shiftDate >= '2026-10-01'));
	});

	it('drops pairs that end after now', () => {
		const early = buildOperationSeed({ now: new Date('2026-09-10T00:00:00Z') });
		expect(early.pairs.every((p) => p.shiftDate < '2026-09-10')).toBe(true);
	});
});
