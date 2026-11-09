import { describe, expect, it } from 'vitest';
import { D, E, N } from '#lib/roster/test-shifts.js';
import type { RosterShift } from '#lib/roster/shift.js';
import {
	MissingHeaderError,
	planPunchImport,
	readPunchSheet,
	type ExistingEvent,
	type ImportInput,
	type PunchRow,
	type ScopeDay
} from './punch-import.js';

/** Damascus wall-clock time as an instant (UTC+3). */
const at = (local: string) => new Date(`${local}:00+03:00`);
const iso = (d: Date) => d.toISOString();

// Made-up people: employee numbers 9001 and 9002.
const ALICE = 'staff-alice';
const BOB = 'staff-bob';
const TEAM = 'team-test';
const HEADER = ['Employee No', 'Name', 'Date', 'Planned shift', 'Check in', 'Check out', 'Note'];

function day(staffId: string, date: string, shift: RosterShift | null): ScopeDay {
	return { staffId, date, teamId: TEAM, shift, source: 'team', swapRole: null };
}

function input(rows: PunchRow[], patch: Partial<ImportInput> = {}): ImportInput {
	const plan: [string, string, RosterShift | null][] = [
		[ALICE, '2026-10-05', D],
		[ALICE, '2026-10-06', N],
		[ALICE, '2026-10-07', null],
		[BOB, '2026-10-05', D]
	];
	return {
		rows,
		people: new Map([
			['9001', ALICE],
			['9002', BOB]
		]),
		days: new Map(plan.map(([s, d, shift]) => [`${s} ${d}`, day(s, d, shift)])),
		shifts: [D, N, E],
		existing: [],
		from: '2026-10-01',
		to: '2026-10-31',
		now: at('2026-11-09T12:00'),
		reason: 'test reason',
		source: 'import',
		...patch
	};
}

const row = (
	line: number,
	employeeNo: string,
	date: string,
	checkIn: string | null,
	checkOut: string | null
): PunchRow => ({
	line,
	employeeNo,
	date,
	checkIn,
	checkOut
});

describe('readPunchSheet', () => {
	it('reads text, Excel times and shorthand; counts rows without times as empty', () => {
		const sheet = [
			HEADER,
			['9001', 'Test A', '2026-10-05', 'D', '07:00', '19:00', ''],
			[
				'9001',
				'Test A',
				new Date('2026-10-06T00:00:00Z'),
				'N',
				new Date('1899-12-30T19:00:00Z'),
				0.3125,
				''
			],
			['9002', 'Test B', '2026-10-05', 'D', '730', '1915', ''],
			['9002', 'Test B', '2026-10-06', 'Off', '', '', 'note only']
		];
		const { rows, issues, empty } = readPunchSheet(sheet);
		expect(issues).toEqual([]);
		expect(empty).toBe(1);
		expect(rows).toEqual([
			row(2, '9001', '2026-10-05', '07:00', '19:00'),
			row(3, '9001', '2026-10-06', '19:00', '07:30'),
			row(4, '9002', '2026-10-05', '07:30', '19:15')
		]);
	});

	it('reports unreadable rows by line', () => {
		const { rows, issues } = readPunchSheet([
			HEADER,
			['', 'x', '2026-10-05', 'D', '07:00', '', ''],
			['9001', 'x', '5/10', 'D', '07:00', '', ''],
			['9001', 'x', '2026-10-05', 'D', '25:00', '', '']
		]);
		expect(rows).toEqual([]);
		expect(issues).toEqual([
			{ line: 2, issue: 'no_employee' },
			{ line: 3, issue: 'bad_date' },
			{ line: 4, issue: 'bad_time' }
		]);
	});

	it('refuses a sheet without the needed columns', () => {
		expect(() => readPunchSheet([['Employee No', 'Date', 'Check in']])).toThrow(MissingHeaderError);
	});
});

describe('planPunchImport', () => {
	it('puts a planned day pair on the planned shift with no reason', () => {
		const plan = planPunchImport(input([row(2, '9001', '2026-10-05', '06:55', '19:05')]));
		expect(plan.rejected).toEqual([]);
		expect(plan.pairs).toHaveLength(1);
		const [pair] = plan.pairs;
		expect(pair).toMatchObject({
			staffId: ALICE,
			shiftDate: '2026-10-05',
			shiftId: 'D',
			planned: true,
			warnings: []
		});
		expect(pair.events.map((e) => [e.type, iso(e.occurredAt), e.teamId, e.reason])).toEqual([
			['check_in', iso(at('2026-10-05T06:55')), TEAM, null],
			['check_out', iso(at('2026-10-05T19:05')), TEAM, null]
		]);
	});

	it('reads a night row like the entry sheet: an earlier check-out is the next morning', () => {
		const plan = planPunchImport(input([row(2, '9001', '2026-10-06', '18:50', '07:10')]));
		const [pair] = plan.pairs;
		expect(pair).toMatchObject({ shiftDate: '2026-10-06', shiftId: 'N', planned: true });
		expect(pair.events.map((e) => iso(e.occurredAt))).toEqual([
			iso(at('2026-10-06T18:50')),
			iso(at('2026-10-07T07:10'))
		]);
	});

	it('rejects people out of scope, dates out of range, days not stored and check-out-only rows', () => {
		const plan = planPunchImport(
			input([
				row(2, '7777', '2026-10-05', '07:00', '19:00'),
				row(3, '9001', '2026-11-01', '07:00', '19:00'),
				row(4, '9002', '2026-10-09', '07:00', '19:00'),
				row(5, '9001', '2026-10-05', null, '19:00')
			])
		);
		expect(plan.pairs).toEqual([]);
		expect(plan.rejected).toEqual([
			{ line: 2, reason: 'not_in_scope' },
			{ line: 3, reason: 'out_of_range' },
			{ line: 4, reason: 'no_roster_day' },
			{ line: 5, reason: 'check_out_only' }
		]);
	});

	it('counts work on an off day for the best-fitting shift, unplanned, with the reason', () => {
		const plan = planPunchImport(input([row(2, '9001', '2026-10-07', '07:05', '19:00')]));
		const [pair] = plan.pairs;
		expect(pair).toMatchObject({
			shiftDate: '2026-10-07',
			shiftId: 'D',
			planned: false,
			warnings: ['unplanned']
		});
		expect(pair.events.every((e) => e.reason === 'test reason')).toBe(true);
	});

	it('moves night times on a planned day shift to the night shift of that date', () => {
		const plan = planPunchImport(input([row(2, '9001', '2026-10-05', '19:00', '07:00')]));
		const [pair] = plan.pairs;
		expect(pair).toMatchObject({
			shiftDate: '2026-10-05',
			shiftId: 'N',
			planned: false,
			warnings: ['unplanned']
		});
		expect(iso(pair.events[1].occurredAt)).toBe(iso(at('2026-10-06T07:00')));
	});

	it('gives a tie to the shift listed first', () => {
		const N2: RosterShift = { ...N, id: 'N2', code: 'N2' };
		const plan = planPunchImport(
			input([row(2, '9001', '2026-10-07', '19:00', '07:00')], { shifts: [N2, D, N, E] })
		);
		expect(plan.pairs[0].shiftId).toBe('N2');
	});

	it('keeps a check-in without a check-out as an open pair', () => {
		const plan = planPunchImport(input([row(2, '9001', '2026-10-05', '07:00', null)]));
		expect(plan.pairs[0].events.map((e) => e.type)).toEqual(['check_in']);
	});

	it('inserts nothing on a rerun', () => {
		const first = planPunchImport(input([row(2, '9001', '2026-10-05', '07:00', '19:00')]));
		const existing: ExistingEvent[] = first.pairs[0].events.map((e, i) => ({
			id: `e${i}`,
			staffId: e.staffId,
			type: e.type,
			occurredAt: e.occurredAt,
			correctsEventId: null,
			isVoid: false,
			source: 'import'
		}));
		const again = planPunchImport(
			input([row(2, '9001', '2026-10-05', '07:00', '19:00')], { existing })
		);
		expect(again).toEqual({ pairs: [], rejected: [], alreadyImported: 1, duplicates: 0 });
	});

	it('adds only the new end when a rerun brings the missing check-out', () => {
		const existing: ExistingEvent[] = [
			{
				id: 'e1',
				staffId: ALICE,
				type: 'check_in',
				occurredAt: at('2026-10-05T07:00'),
				correctsEventId: null,
				isVoid: false,
				source: 'import'
			}
		];
		const plan = planPunchImport(
			input([row(2, '9001', '2026-10-05', '07:00', '19:00')], { existing })
		);
		expect(plan.rejected).toEqual([]);
		expect(plan.pairs[0].events.map((e) => e.type)).toEqual(['check_out']);
	});

	it('skips a copied row within 60 s as a duplicate', () => {
		const plan = planPunchImport(
			input([
				row(2, '9001', '2026-10-05', '07:00', '19:00'),
				row(3, '9001', '2026-10-05', '07:00', '19:00')
			])
		);
		expect(plan.pairs).toHaveLength(1);
		expect(plan.duplicates).toBe(1);
	});

	it('rejects a pair that overlaps a stored one, or is too long, or is in the future', () => {
		const existing: ExistingEvent[] = [
			{
				id: 'm1',
				staffId: BOB,
				type: 'check_in',
				occurredAt: at('2026-10-05T08:00'),
				correctsEventId: null,
				isVoid: false,
				source: 'manual'
			},
			{
				id: 'm2',
				staffId: BOB,
				type: 'check_out',
				occurredAt: at('2026-10-05T12:00'),
				correctsEventId: null,
				isVoid: false,
				source: 'manual'
			}
		];
		const plan = planPunchImport(
			input(
				[
					row(2, '9002', '2026-10-05', '10:00', '18:00'),
					row(3, '9001', '2026-10-05', '04:00', '23:00'),
					row(4, '9001', '2026-10-06', '19:00', '07:00')
				],
				{ existing, now: at('2026-10-06T20:00') }
			)
		);
		expect(plan.pairs).toEqual([]);
		expect(plan.rejected).toEqual([
			{ line: 2, reason: 'overlap' },
			{ line: 3, reason: 'span_too_long' },
			{ line: 4, reason: 'future' }
		]);
	});
});
