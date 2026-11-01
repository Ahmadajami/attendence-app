import { describe, expect, it } from 'vitest';
import { startOfDamascusDay } from '#lib/roster/cycle.js';
import { ancestorChain } from './departments.js';
import {
	chainOf,
	gaps,
	managerOn,
	momentOf,
	scopeOf,
	type Org,
	type OrgPerson
} from './management.js';

// A made-up organisation (CLAUDE.md §1): ids only, no people.
//
//   ops (manager: m-ops)              admin (no manager anywhere: a gap)
//   ├── ramp (m-ramp1, then m-ramp2 from day 15)
//   └── gate (no own manager: covered by m-ops)
//
// Teams: t-ramp (ramp; supervisors s-ramp-a, a member, and s-ramp-b, not a member),
// t-gate (gate; s-gate, and s-gate-old who is inactive), t-ops (ops; s-admin, who works in admin:
// outside the branch), t-admin (admin; no supervisor).
// p3 moves from t-ramp to t-gate on day 10.

const day = (n: number) => `2026-03-${String(n).padStart(2, '0')}`;
const at = (n: number) => startOfDamascusDay(day(n));
const START = startOfDamascusDay('2026-01-01');

const person = (staffId: string, departmentId: string | null, active = true): OrgPerson => ({
	staffId,
	departmentId,
	active
});

const org: Org = {
	departments: [
		{ id: 'ops', parentId: null, active: true },
		{ id: 'ramp', parentId: 'ops', active: true },
		{ id: 'gate', parentId: 'ops', active: true },
		{ id: 'admin', parentId: null, active: true }
	],
	teams: [
		{ id: 't-ramp', departmentId: 'ramp', active: true },
		{ id: 't-gate', departmentId: 'gate', active: true },
		{ id: 't-ops', departmentId: 'ops', active: true },
		{ id: 't-admin', departmentId: 'admin', active: true }
	],
	people: [
		person('m-ops', 'ops'),
		person('m-ramp1', 'ramp'),
		person('m-ramp2', 'ramp'),
		person('s-ramp-a', 'ramp'),
		person('s-ramp-b', 'ramp'),
		person('s-gate', 'gate'),
		person('s-gate-old', 'gate', false),
		person('s-admin', 'admin'),
		person('p1', 'ramp'),
		person('p2', 'gate'),
		person('p3', 'ramp'),
		person('p4', 'ops'),
		person('p5', 'admin')
	],
	managers: [
		{ departmentId: 'ops', staffId: 'm-ops', validFrom: '2026-01-01', validTo: null },
		{ departmentId: 'ramp', staffId: 'm-ramp1', validFrom: '2026-01-01', validTo: day(15) },
		{ departmentId: 'ramp', staffId: 'm-ramp2', validFrom: day(15), validTo: null }
	],
	supervisors: [
		{ teamId: 't-ramp', staffId: 's-ramp-b', addedAt: START, removedAt: null },
		{ teamId: 't-ramp', staffId: 's-ramp-a', addedAt: START, removedAt: null },
		{ teamId: 't-gate', staffId: 's-gate', addedAt: START, removedAt: null },
		{ teamId: 't-gate', staffId: 's-gate-old', addedAt: START, removedAt: null },
		{ teamId: 't-ops', staffId: 's-admin', addedAt: START, removedAt: null }
	],
	memberships: [
		{ staffId: 'p1', teamId: 't-ramp', validFrom: START, validTo: null },
		{ staffId: 's-ramp-a', teamId: 't-ramp', validFrom: START, validTo: null },
		{ staffId: 'p2', teamId: 't-gate', validFrom: START, validTo: null },
		{ staffId: 's-gate', teamId: 't-gate', validFrom: START, validTo: null },
		{ staffId: 'p3', teamId: 't-ramp', validFrom: START, validTo: at(10) },
		{ staffId: 'p3', teamId: 't-gate', validFrom: at(10), validTo: null },
		{ staffId: 'p5', teamId: 't-admin', validFrom: START, validTo: null }
	]
};

const m = (n: number) => momentOf(day(n));

describe('managerOn', () => {
	const chain = (id: string) => ancestorChain(org.departments, id);

	it('is the department’s own manager, by date (M3)', () => {
		expect(managerOn(chain('ramp'), org.managers, day(14))?.staffId).toBe('m-ramp1');
		expect(managerOn(chain('ramp'), org.managers, day(15))?.staffId).toBe('m-ramp2');
	});

	it('is the parent’s manager when the sub-department has none (M2)', () => {
		expect(managerOn(chain('gate'), org.managers, day(1))).toEqual({
			departmentId: 'ops',
			staffId: 'm-ops'
		});
	});

	it('is null when nobody up the tree manages', () => {
		expect(managerOn(chain('admin'), org.managers, day(1))).toBeNull();
	});

	it('skips the people it is told to skip', () => {
		expect(managerOn(chain('ramp'), org.managers, day(1), (id) => id === 'm-ramp1')).toEqual({
			departmentId: 'ops',
			staffId: 'm-ops'
		});
	});
});

describe('chainOf (M5)', () => {
	it('a member: both supervisors → the nearest manager → HR', () => {
		expect(chainOf('p1', m(1), org)).toEqual([
			{ level: 'supervisor', staffId: 's-ramp-a', teamId: 't-ramp' },
			{ level: 'supervisor', staffId: 's-ramp-b', teamId: 't-ramp' },
			{ level: 'manager', staffId: 'm-ramp1', departmentId: 'ramp' },
			{ level: 'hr' }
		]);
	});

	it('a sub-department without its own manager climbs to the parent’s manager', () => {
		expect(chainOf('p2', m(1), org)).toEqual([
			{ level: 'supervisor', staffId: 's-gate', teamId: 't-gate' },
			{ level: 'manager', staffId: 'm-ops', departmentId: 'ops' },
			{ level: 'hr' }
		]);
	});

	it('leaves out an inactive supervisor (they can’t act; a gap instead)', () => {
		expect(chainOf('p2', m(1), org).some((s) => 'staffId' in s && s.staffId === 's-gate-old')).toBe(
			false
		);
	});

	it('a person without a team goes straight to their department’s manager', () => {
		expect(chainOf('p4', m(1), org)).toEqual([
			{ level: 'manager', staffId: 'm-ops', departmentId: 'ops' },
			{ level: 'hr' }
		]);
	});

	it('a supervisor’s chain starts at the manager', () => {
		expect(chainOf('s-ramp-a', m(1), org)).toEqual([
			{ level: 'manager', staffId: 'm-ramp1', departmentId: 'ramp' },
			{ level: 'hr' }
		]);
	});

	it('a manager’s chain goes to the parent department’s manager, then HR', () => {
		expect(chainOf('m-ramp1', m(1), org)).toEqual([
			{ level: 'manager', staffId: 'm-ops', departmentId: 'ops' },
			{ level: 'hr' }
		]);
		expect(chainOf('m-ops', m(1), org)).toEqual([{ level: 'hr' }]);
	});

	it('nobody is ever in their own chain', () => {
		for (const { staffId } of org.people) {
			for (const n of [1, 9, 10, 14, 15, 20]) {
				const ids = chainOf(staffId, m(n), org).flatMap((s) => ('staffId' in s ? [s.staffId] : []));
				expect(ids).not.toContain(staffId);
			}
		}
	});

	it('follows a team change on day 10', () => {
		expect(chainOf('p3', m(9), org).map((s) => ('staffId' in s ? s.staffId : 'hr'))).toEqual([
			's-ramp-a',
			's-ramp-b',
			'm-ramp1',
			'hr'
		]);
		expect(chainOf('p3', m(10), org).map((s) => ('staffId' in s ? s.staffId : 'hr'))).toEqual([
			's-gate',
			'm-ops',
			'hr'
		]);
	});

	it('follows a manager change on day 15', () => {
		const manager = (n: number) =>
			chainOf('p1', m(n), org).find((s) => s.level === 'manager') as { staffId: string };
		expect(manager(14).staffId).toBe('m-ramp1');
		expect(manager(15).staffId).toBe('m-ramp2');
	});

	it('skips an inactive manager to the next one up, or to HR', () => {
		const withInactiveTop: Org = {
			...org,
			people: org.people.map((p) => (p.staffId === 'm-ops' ? { ...p, active: false } : p))
		};
		expect(chainOf('p4', m(1), withInactiveTop)).toEqual([{ level: 'hr' }]);
		expect(chainOf('m-ramp1', m(1), withInactiveTop)).toEqual([{ level: 'hr' }]);
	});

	it('an unknown person only has HR', () => {
		expect(chainOf('nobody', m(1), org)).toEqual([{ level: 'hr' }]);
	});
});

describe('scopeOf (M6)', () => {
	it('a supervisor covers their team’s members that day', () => {
		expect(scopeOf('s-gate', m(9), org)).toEqual({
			asManager: [],
			asSupervisor: ['t-gate'],
			people: ['p2']
		});
		expect(scopeOf('s-gate', m(10), org).people).toEqual(['p2', 'p3']);
	});

	it('a supervisor outside the team still covers its members', () => {
		expect(scopeOf('s-ramp-b', m(1), org).people).toEqual(['p1', 'p3', 's-ramp-a']);
	});

	it('a manager covers the department and every sub-department, with their supervisors', () => {
		expect(scopeOf('m-ops', m(1), org)).toEqual({
			asManager: ['ops'],
			asSupervisor: [],
			people: [
				'm-ramp1',
				'm-ramp2',
				'p1',
				'p2',
				'p3',
				'p4',
				's-admin',
				's-gate',
				's-ramp-a',
				's-ramp-b'
			]
		});
	});

	it('a sub-department manager covers only their branch, and only while they manage it', () => {
		expect(scopeOf('m-ramp1', m(1), org)).toEqual({
			asManager: ['ramp'],
			asSupervisor: [],
			people: ['m-ramp2', 'p1', 'p3', 's-ramp-a', 's-ramp-b']
		});
		expect(scopeOf('m-ramp1', m(15), org)).toEqual({
			asManager: [],
			asSupervisor: [],
			people: []
		});
	});

	it('someone who leaves the branch on day 10 leaves the scope', () => {
		expect(scopeOf('m-ramp1', m(9), org).people).toContain('p3');
		expect(scopeOf('m-ramp1', m(10), org).people).not.toContain('p3');
	});

	it('never contains the person or an inactive person', () => {
		for (const { staffId } of org.people) {
			const scope = scopeOf(staffId, m(1), org);
			expect(scope.people).not.toContain(staffId);
			expect(scope.people).not.toContain('s-gate-old');
		}
	});
});

describe('gaps (M8)', () => {
	it('lists every kind, with ids only', () => {
		expect(gaps(org, m(1))).toEqual([
			{ kind: 'department_without_manager', departmentId: 'admin' },
			{ kind: 'team_without_supervisor', teamId: 't-admin' },
			{ kind: 'inactive_supervisor', teamId: 't-gate', staffId: 's-gate-old' },
			{ kind: 'supervisor_outside_branch', teamId: 't-ops', staffId: 's-admin' }
		]);
	});

	it('flags an inactive manager still in place', () => {
		const withInactive: Org = {
			...org,
			people: org.people.map((p) => (p.staffId === 'm-ramp2' ? { ...p, active: false } : p))
		};
		expect(gaps(withInactive, m(15))).toContainEqual({
			kind: 'inactive_manager',
			departmentId: 'ramp',
			staffId: 'm-ramp2'
		});
		expect(gaps(withInactive, m(14))).not.toContainEqual(
			expect.objectContaining({ kind: 'inactive_manager' })
		);
	});

	it('ignores inactive departments and teams, and sub-departments covered from above', () => {
		const quiet: Org = {
			...org,
			departments: org.departments.map((d) => (d.id === 'admin' ? { ...d, active: false } : d)),
			teams: org.teams.map((t) => (t.id === 't-admin' ? { ...t, active: false } : t))
		};
		const kinds = gaps(quiet, m(1)).map((g) => g.kind);
		expect(kinds).not.toContain('department_without_manager');
		expect(kinds).not.toContain('team_without_supervisor');
	});

	it('a supervisor removed before the day no longer counts', () => {
		const removed: Org = {
			...org,
			supervisors: org.supervisors.map((s) =>
				s.staffId === 's-admin' ? { ...s, removedAt: at(5) } : s
			)
		};
		expect(gaps(removed, m(5))).toContainEqual({
			kind: 'team_without_supervisor',
			teamId: 't-ops'
		});
	});
});
