import { describe, expect, it } from 'vitest';
import {
	applyAssignmentChange,
	assignmentImpact,
	planAssignmentChange,
	staffing,
	type ImpactPerson
} from './assignments.js';
import { addDays, startOfDamascusDay } from './cycle.js';
import {
	rosterDay,
	rosterRange,
	type RosterAssignment,
	type RosterInput,
	type RosterSchedule
} from './roster.js';
import { letter, SHIFTS, slots } from './test-shifts.js';

// Made-up teams, departments and people only. 2026-11-01 is a Sunday.

let nextId = 0;
type Target = { teamId?: string; departmentId?: string };

function assignment(
	target: Target,
	type: 'cycle' | 'weekly',
	codes: string,
	effectiveFrom: string,
	extra: Partial<RosterAssignment> = {}
): RosterAssignment {
	nextId++;
	return {
		id: `a${nextId}`,
		patternId: `p${nextId}`,
		teamId: target.teamId ?? null,
		departmentId: target.departmentId ?? null,
		type,
		slots: slots(codes),
		defaultWorkShiftId: null,
		anchorDate: type === 'cycle' ? effectiveFrom : null,
		effectiveFrom,
		effectiveTo: null,
		...extra
	};
}

const member = (teamId: string, from = '2026-01-01', to: string | null = null) => ({
	teamId,
	validFrom: startOfDamascusDay(from),
	validTo: to === null ? null : startOfDamascusDay(to)
});

const schedule = (rule: Partial<RosterSchedule>): RosterSchedule => ({
	offWeekdays: null,
	crewStart: null,
	effectiveFrom: '2026-01-01',
	effectiveTo: null,
	...rule
});

const person = (input: Partial<RosterInput> = {}): RosterInput => ({
	memberships: [],
	personalAssignments: [],
	teamAssignments: [],
	departmentAssignments: [],
	departmentChain: [],
	schedules: [],
	overrides: [],
	absences: [],
	shifts: SHIFTS,
	...input
});

const letters = (input: RosterInput, from: string, days: number) =>
	rosterRange(input, from, days)
		.map((d) => letter(d.shiftId))
		.join(' ');

describe('precedence (A1)', () => {
	// Department weekly D Sun–Thu; team B "N O" until 8 Nov; own pattern E until 5 Nov.
	const dept = assignment({ departmentId: 'dept-1' }, 'weekly', 'D D D D D O O', '2026-01-01');
	const team = assignment({ teamId: 'team-b' }, 'cycle', 'N O', '2026-11-01', {
		effectiveTo: '2026-11-08'
	});
	const own = assignment({}, 'cycle', 'E', '2026-11-01', { effectiveTo: '2026-11-05' });
	const input = person({
		memberships: [member('team-b')],
		personalAssignments: [own],
		teamAssignments: [team],
		departmentAssignments: [dept],
		departmentChain: ['dept-1']
	});

	it('takes the own pattern, then the team, then the department as each ends', () => {
		expect(rosterDay(input, '2026-11-03')).toMatchObject({
			shiftId: 'E',
			source: 'personal',
			assignmentId: own.id,
			patternId: own.patternId
		});
		expect(rosterDay(input, '2026-11-05')).toMatchObject({ shiftId: 'N', source: 'team' });
		expect(rosterDay(input, '2026-11-09')).toMatchObject({
			shiftId: 'D',
			source: 'department',
			assignmentId: dept.id
		});
	});

	it('keeps the assignment that plans the day under an override or absence', () => {
		const covered = rosterDay(
			{
				...input,
				overrides: [{ shiftDate: '2026-11-05', shiftId: null, swapGroupId: null }],
				absences: [{ startsOn: '2026-11-09', endsOn: '2026-11-09', type: 'sick' }]
			},
			'2026-11-05'
		);
		expect(covered).toMatchObject({ source: 'override', assignmentId: team.id, shiftId: null });
	});
});

describe('own off days (A4, B5)', () => {
	// Department "Morning" weekly: Sun–Thu work, Fri + Sat off.
	const morning = assignment({ departmentId: 'dept-1' }, 'weekly', 'D D D D D O O', '2026-01-01');
	const base = { departmentAssignments: [morning], departmentChain: ['dept-1'] };

	it('moves one person to Sat + Sun off; a colleague keeps Fri + Sat', () => {
		const own = person({ ...base, schedules: [schedule({ offWeekdays: [6, 0] })] });
		const colleague = person(base);
		expect(letters(own, '2026-11-01', 7)).toBe('O D D D D D O');
		expect(letters(colleague, '2026-11-01', 7)).toBe('D D D D D O O');
		expect(rosterRange(own, '2026-11-01', 7).map((d) => d.adjustment)).toEqual([
			'own_off',
			null,
			null,
			null,
			null,
			'own_work',
			null
		]);
	});

	it("works a pattern off day with the pattern's default work shift", () => {
		const nights = { ...morning, slots: slots('D D N N D O O'), defaultWorkShiftId: 'E' };
		const own = person({
			departmentAssignments: [nights],
			departmentChain: ['dept-1'],
			schedules: [schedule({ offWeekdays: [0] })]
		});
		// Friday: the pattern is off, Friday isn't listed → E (the default, not the most used D).
		expect(rosterDay(own, '2026-11-06')).toMatchObject({ shiftId: 'E', adjustment: 'own_work' });
	});

	it('only from the date the rule starts', () => {
		const own = person({
			...base,
			schedules: [schedule({ offWeekdays: [6, 0], effectiveFrom: '2026-11-08' })]
		});
		expect(letters(own, '2026-11-01', 14)).toBe('D D D D D O O O D D D D D O');
	});

	it('do not change a cycle, or an own (personal) pattern', () => {
		const rule = [schedule({ offWeekdays: [0, 1, 2, 3, 4, 5, 6] })];
		const cycle = person({
			departmentAssignments: [assignment({ departmentId: 'dept-1' }, 'cycle', 'D N', '2026-11-01')],
			departmentChain: ['dept-1'],
			schedules: rule
		});
		expect(letters(cycle, '2026-11-01', 4)).toBe('D N D N');
		const personal = person({
			personalAssignments: [assignment({}, 'weekly', 'D D D D D O O', '2026-01-01')],
			schedules: rule
		});
		expect(letters(personal, '2026-11-01', 7)).toBe('D D D D D O O');
	});
});

describe('crew start (B4)', () => {
	// In force from January, anchored on 2 Nov: the stagger holds before the anchor too.
	const cycle = assignment({ teamId: 'team-c' }, 'cycle', 'D D N N O O O O', '2026-11-02', {
		effectiveFrom: '2026-01-01'
	});
	const crew = [0, 2, 4, 6].map((crewStart) =>
		person({
			memberships: [member('team-c')],
			teamAssignments: [cycle],
			schedules: [schedule({ crewStart })]
		})
	);

	it.each(['2026-11-02', '2026-10-01'])(
		'staggers a team of 4 to exactly 1 D + 1 N + 2 off every day (from %s)',
		(from) => {
			const days = staffing(crew.flatMap((input) => rosterRange(input, from, 16)));
			expect(days).toHaveLength(16);
			for (const day of days)
				expect(day).toMatchObject({ shifts: { D: 1, N: 1 }, off: 2, absent: 0 });
		}
	);

	it('is ignored by an own (personal) cycle, which has its own anchor', () => {
		const own = person({
			personalAssignments: [assignment({}, 'cycle', 'D N O O', '2026-11-02')],
			schedules: [schedule({ crewStart: 1 })]
		});
		expect(letters(own, '2026-11-02', 4)).toBe('D N O O');
	});
});

describe('weekly hours of D D N N O O O O (N10)', () => {
	it('alternates 36 h and 48 h weeks, with no fixed weekly target', () => {
		const input = person({
			memberships: [member('team-c')],
			teamAssignments: [assignment({ teamId: 'team-c' }, 'cycle', 'D D N N O O O O', '2026-11-02')]
		});
		const weeks = Array.from({ length: 8 }, (_, w) => {
			const worked = rosterRange(input, addDays('2026-11-01', 7 * w), 7).filter((d) => d.shift);
			return worked.length * 12;
		});
		expect(new Set(weeks)).toEqual(new Set([36, 48]));
	});
});

describe('membership dates (B8)', () => {
	const team = assignment({ teamId: 'team-d' }, 'cycle', 'D N O O E D N O', '2026-11-01');
	const dept = assignment({ departmentId: 'dept-1' }, 'weekly', 'E E E E E E E', '2026-01-01');
	const joiner = person({
		memberships: [member('team-d', '2026-11-05', '2026-11-10')],
		teamAssignments: [team],
		departmentAssignments: [dept],
		departmentChain: ['dept-1'],
		schedules: [schedule({ crewStart: 2 })]
	});

	it("joins mid-cycle on the team's slot plus their crew start, not slot 0", () => {
		// 5 Nov is the cycle's slot 4; + crew start 2 = slot 6 (N).
		expect(rosterDay(joiner, '2026-11-05')).toMatchObject({ shiftId: 'N', source: 'team' });
		expect(letters(joiner, '2026-11-05', 5)).toBe('N O D N O');
	});

	it('follows the department before joining and from the day they leave', () => {
		expect(rosterDay(joiner, '2026-11-04')).toMatchObject({ source: 'department', teamId: null });
		expect(rosterDay(joiner, '2026-11-10')).toMatchObject({ shiftId: 'E', source: 'department' });
	});
});

describe('change from a date (A5-light, A3)', () => {
	const old = assignment({ teamId: 'team-e' }, 'cycle', 'D N O O', '2026-11-01');
	const next = assignment({ teamId: 'team-e' }, 'cycle', 'N N O O', '2026-11-15');
	const before = person({
		memberships: [member('team-e')],
		teamAssignments: [old],
		overrides: [{ shiftDate: '2026-11-16', shiftId: 'D', swapGroupId: null }],
		absences: [{ startsOn: '2026-11-17', endsOn: '2026-11-17', type: 'leave' }]
	});
	const after = {
		...before,
		teamAssignments: applyAssignmentChange(
			before.teamAssignments,
			{ kind: 'team', teamId: 'team-e' },
			next
		)
	};

	it('keeps days before the date and follows the new pattern from it', () => {
		expect(letters(after, '2026-11-01', 14)).toBe(letters(before, '2026-11-01', 14));
		expect(after.teamAssignments[0]).toMatchObject({ id: old.id, effectiveTo: '2026-11-15' });
		expect(rosterDay(after, '2026-11-15')).toMatchObject({ shiftId: 'N', assignmentId: next.id });
		expect(letters(after, '2026-11-18', 2)).toBe('O N');
	});

	it('keeps overrides and absences on the changed days', () => {
		expect(rosterDay(after, '2026-11-16')).toMatchObject({ shiftId: 'D', source: 'override' });
		expect(rosterDay(after, '2026-11-17')).toMatchObject({ source: 'absence' });
	});
});

describe('planAssignmentChange', () => {
	it('closes and replaces only the target’s own assignments', () => {
		const a = assignment({ teamId: 'team-f' }, 'cycle', 'D N', '2026-11-01');
		const scheduled = assignment({ teamId: 'team-f' }, 'cycle', 'N D', '2026-12-01');
		const other = assignment({ teamId: 'team-g' }, 'cycle', 'D N', '2026-11-01');
		expect(
			planAssignmentChange([a, scheduled, other], { kind: 'team', teamId: 'team-f' }, '2026-11-20')
		).toEqual({
			closed: a,
			removed: [scheduled]
		});
		expect(
			planAssignmentChange([other], { kind: 'department', departmentId: 'dept-1' }, '2026-11-20')
		).toEqual({
			closed: null,
			removed: []
		});
	});

	it('matches personal assignments by person', () => {
		const own = { ...assignment({}, 'weekly', 'D D D D D O O', '2026-11-01'), staffId: 'staff-1' };
		expect(
			planAssignmentChange([own], { kind: 'staff', staffId: 'staff-1' }, '2026-11-20').closed
		).toBe(own);
		expect(
			planAssignmentChange([own], { kind: 'staff', staffId: 'staff-2' }, '2026-11-20').closed
		).toBeNull();
	});
});

describe('assignmentImpact', () => {
	const target = { kind: 'team', teamId: 'team-h' } as const;
	const draft = assignment({ teamId: 'team-h' }, 'weekly', 'D D D D D O O', '2026-11-01');
	const inTeam = { memberships: [member('team-h')] };
	const people: ImpactPerson[] = [
		{
			staffId: 'staff-plain',
			input: person({
				...inTeam,
				overrides: [{ shiftDate: '2026-11-02', shiftId: null, swapGroupId: null }],
				absences: [{ startsOn: '2026-11-03', endsOn: '2026-11-04', type: 'sick' }]
			})
		},
		{
			staffId: 'staff-own-pattern',
			input: person({
				...inTeam,
				personalAssignments: [assignment({}, 'cycle', 'N O', '2026-01-01')]
			})
		},
		{
			staffId: 'staff-own-off',
			input: person({ ...inTeam, schedules: [schedule({ offWeekdays: [6, 0] })] }),
			punchedDates: ['2026-11-02', '2026-11-07']
		},
		{ staffId: 'staff-elsewhere', input: person({ memberships: [member('team-x')] }) }
	];

	it('counts who it applies to, and what stays as it is', () => {
		expect(assignmentImpact(people, target, draft, '2026-11-01', 14)).toEqual({
			people: 4,
			applies: 2,
			ownPattern: 1,
			ownOffDays: 1,
			crewStarts: 0,
			notMembers: 1,
			overrideDays: 1,
			absenceDays: 2,
			punchedDays: 2
		});
	});

	it('counts crew starts for a cycle', () => {
		const cycle = assignment({ teamId: 'team-h' }, 'cycle', 'D N O O', '2026-11-01');
		const crewed: ImpactPerson[] = [
			{ staffId: 'staff-a', input: person({ ...inTeam, schedules: [schedule({ crewStart: 2 })] }) },
			{ staffId: 'staff-b', input: person(inTeam) }
		];
		expect(assignmentImpact(crewed, target, cycle, '2026-11-01', 4)).toMatchObject({
			applies: 2,
			crewStarts: 1,
			ownOffDays: 0
		});
	});
});

describe('staffing', () => {
	it('counts absences apart from days off, sorted by date', () => {
		const input = person({
			memberships: [member('team-c')],
			teamAssignments: [assignment({ teamId: 'team-c' }, 'cycle', 'D O', '2026-11-01')],
			absences: [{ startsOn: '2026-11-03', endsOn: '2026-11-03', type: 'sick' }]
		});
		const days = rosterRange(input, '2026-11-01', 3);
		expect(staffing([...days].reverse())).toEqual([
			{ date: '2026-11-01', shifts: { D: 1 }, off: 0, holiday: 0, absent: 0 },
			{ date: '2026-11-02', shifts: {}, off: 1, holiday: 0, absent: 0 },
			{ date: '2026-11-03', shifts: {}, off: 0, holiday: 0, absent: 1 }
		]);
	});

	it("counts a pattern's holiday apart from days off", () => {
		const cycle = assignment({ teamId: 'team-h' }, 'cycle', 'D D', '2026-11-01');
		const input = person({
			memberships: [member('team-h')],
			teamAssignments: [cycle],
			holidays: [
				{
					id: 'h1',
					patternId: cycle.patternId,
					startsOn: '2026-11-02',
					endsOn: '2026-11-02',
					otEligible: false
				}
			]
		});
		expect(staffing(rosterRange(input, '2026-11-01', 2))).toEqual([
			{ date: '2026-11-01', shifts: { D: 1 }, off: 0, holiday: 0, absent: 0 },
			{ date: '2026-11-02', shifts: {}, off: 0, holiday: 1, absent: 0 }
		]);
	});
});
