// Two-level management (plans/2026-11-01-two-level-management.md, Phase 2): who is responsible for
// whom on a date. Pure: no DB, no SvelteKit; the services load an `Org` and call these. Client-safe.
//
// Level 1 = department manager (dated by day, `department_manager`, M3); level 2 = team supervisor
// (dated by instant, `team_supervisor`); HR above both (M1). Memberships are dated by instant too.

import { startOfDamascusDay } from '#lib/roster/cycle.js';
import { ancestorChain, descendantIds } from './departments.js';

export type OrgDepartment = { id: string; parentId: string | null; active: boolean };
/** A team sits in one department (D22; `null` for teams made before the builder plan). */
export type OrgTeam = { id: string; departmentId: string | null; active: boolean };
/** `departmentId` is the person's own department (`staff.department_id`, not dated). */
export type OrgPerson = { staffId: string; departmentId: string | null; active: boolean };
/** `validTo` is exclusive, `null` while open (M3). */
export type ManagerVersion = {
	departmentId: string;
	staffId: string;
	validFrom: string;
	validTo: string | null;
};
/** `removedAt` is `null` while the person supervises the team. */
export type SupervisorVersion = {
	teamId: string;
	staffId: string;
	addedAt: Date;
	removedAt: Date | null;
};
/** Team membership history (`staff_team_membership`); `validTo` exclusive, `null` while open. */
export type Membership = { staffId: string; teamId: string; validFrom: Date; validTo: Date | null };

export type Org = {
	departments: readonly OrgDepartment[];
	teams: readonly OrgTeam[];
	people: readonly OrgPerson[];
	managers: readonly ManagerVersion[];
	supervisors: readonly SupervisorVersion[];
	memberships: readonly Membership[];
};

/**
 * When the organisation is read: `date` for the day-dated manager rows, `at` for the
 * instant-dated memberships and supervisors. `momentOf(date)` reads both at 00:00 Damascus of the
 * date, like `teamOnDate` (default M23); a live view of today may pass the current instant as `at`.
 */
export type OrgMoment = { date: string; at: Date };

export function momentOf(date: string, at: Date = startOfDamascusDay(date)): OrgMoment {
	return { date, at };
}

export type ChainStep =
	| { level: 'supervisor'; staffId: string; teamId: string }
	| { level: 'manager'; staffId: string; departmentId: string }
	| { level: 'hr' };

export type Scope = {
	/** Departments the person manages that day (their own rows, not the ones below). */
	asManager: string[];
	/** Teams the person supervises at that moment. */
	asSupervisor: string[];
	/** Active people they cover (M6), never themself, sorted. */
	people: string[];
};

export type Gap =
	| { kind: 'department_without_manager'; departmentId: string }
	| { kind: 'team_without_supervisor'; teamId: string }
	| { kind: 'inactive_manager'; departmentId: string; staffId: string }
	| { kind: 'inactive_supervisor'; teamId: string; staffId: string }
	| { kind: 'supervisor_outside_branch'; teamId: string; staffId: string };

const GAP_ORDER: Gap['kind'][] = [
	'department_without_manager',
	'team_without_supervisor',
	'inactive_manager',
	'inactive_supervisor',
	'supervisor_outside_branch'
];

function inForceOn(version: ManagerVersion, date: string): boolean {
	return version.validFrom <= date && (version.validTo === null || version.validTo > date);
}

function inForceAt(from: Date, to: Date | null, at: Date): boolean {
	const t = at.getTime();
	return from.getTime() <= t && (to === null || t < to.getTime());
}

function activeIds(org: Org): Set<string> {
	return new Set(org.people.filter((p) => p.active).map((p) => p.staffId));
}

/** The managers of each department on `date` (at most one each, M2; the first row wins). */
function managersOn(managers: readonly ManagerVersion[], date: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const version of managers) {
		if (inForceOn(version, date) && !out.has(version.departmentId))
			out.set(version.departmentId, version.staffId);
	}
	return out;
}

/** The supervisors of `teamId` at `at`, sorted by id. */
function supervisorsAt(org: Org, teamId: string, at: Date): string[] {
	return org.supervisors
		.filter((s) => s.teamId === teamId && inForceAt(s.addedAt, s.removedAt, at))
		.map((s) => s.staffId)
		.sort();
}

/** The person's team at `at` (their open membership), or `null`. */
export function teamAt(org: Org, staffId: string, at: Date): string | null {
	return (
		org.memberships.find((m) => m.staffId === staffId && inForceAt(m.validFrom, m.validTo, at))
			?.teamId ?? null
	);
}

/** Where the person works at that moment: their team's department, else their own department. */
export function departmentOf(org: Org, person: OrgPerson, moment: OrgMoment): string | null {
	const teamId = teamAt(org, person.staffId, moment.at);
	const team = teamId ? org.teams.find((t) => t.id === teamId) : undefined;
	return team?.departmentId ?? person.departmentId;
}

/**
 * The nearest manager up `departmentChain` (nearest first, from `ancestorChain`) on `date` (M2):
 * a department without its own manager is covered by the next one up. `skip` leaves people out
 * (the person themself, M5; inactive managers, who can't act). `null` when nobody is left.
 */
export function managerOn(
	departmentChain: readonly string[],
	managers: readonly ManagerVersion[],
	date: string,
	skip: (staffId: string) => boolean = () => false
): { departmentId: string; staffId: string } | null {
	const byDepartment = managersOn(managers, date);
	for (const departmentId of departmentChain) {
		const staffId = byDepartment.get(departmentId);
		if (staffId && !skip(staffId)) return { departmentId, staffId };
	}
	return null;
}

/** True when `staffId` supervises any team at `at`. */
function supervisesAt(org: Org, staffId: string, at: Date): boolean {
	return org.supervisors.some(
		(s) => s.staffId === staffId && inForceAt(s.addedAt, s.removedAt, at)
	);
}

/**
 * Who is responsible for `staffId` on that day (M5): the active supervisors of their team → the
 * nearest active manager of the team's department (or of their own department without a team) →
 * HR. Never the person themself: a supervisor's chain starts at the manager, a manager's at the
 * next manager up (the parent department's). HR always ends it (Q-M6).
 */
export function chainOf(staffId: string, moment: OrgMoment, org: Org): ChainStep[] {
	const person = org.people.find((p) => p.staffId === staffId);
	if (!person) return [{ level: 'hr' }];
	const active = activeIds(org);
	const steps: ChainStep[] = [];

	const teamId = teamAt(org, staffId, moment.at);
	if (teamId && !supervisesAt(org, staffId, moment.at)) {
		for (const supervisor of supervisorsAt(org, teamId, moment.at)) {
			if (supervisor !== staffId && active.has(supervisor))
				steps.push({ level: 'supervisor', staffId: supervisor, teamId });
		}
	}

	const manager = managerOn(
		ancestorChain(org.departments, departmentOf(org, person, moment)),
		org.managers,
		moment.date,
		(id) => id === staffId || !active.has(id)
	);
	if (manager) steps.push({ level: 'manager', ...manager });

	steps.push({ level: 'hr' });
	return steps;
}

/**
 * Whom `staffId` covers on that day (M6), computed from dated membership, never stored. A
 * supervisor covers the members of their teams; a manager covers everyone working in their
 * department(s) and every sub-department (also those with their own manager, Q-M4), and the
 * supervisors of the teams there. Active people only, never the person themself.
 */
export function scopeOf(staffId: string, moment: OrgMoment, org: Org): Scope {
	const active = activeIds(org);
	const asManager = [...managersOn(org.managers, moment.date)]
		.filter(([, manager]) => manager === staffId)
		.map(([departmentId]) => departmentId)
		.sort();
	const asSupervisor = [
		...new Set(
			org.supervisors
				.filter((s) => s.staffId === staffId && inForceAt(s.addedAt, s.removedAt, moment.at))
				.map((s) => s.teamId)
		)
	].sort();

	const covered = new Set<string>();
	for (const departmentId of asManager) {
		covered.add(departmentId);
		for (const below of descendantIds(org.departments, departmentId)) covered.add(below);
	}

	const people = new Set<string>();
	for (const person of org.people) {
		const department = departmentOf(org, person, moment);
		if (department && covered.has(department)) people.add(person.staffId);
	}
	for (const membership of org.memberships) {
		if (
			asSupervisor.includes(membership.teamId) &&
			inForceAt(membership.validFrom, membership.validTo, moment.at)
		)
			people.add(membership.staffId);
	}
	for (const team of org.teams) {
		if (team.departmentId && covered.has(team.departmentId))
			for (const supervisor of supervisorsAt(org, team.id, moment.at)) people.add(supervisor);
	}

	people.delete(staffId);
	return {
		asManager,
		asSupervisor,
		people: [...people].filter((id) => active.has(id)).sort()
	};
}

/**
 * What HR should fix on that day (M8), with record ids only:
 * - an active department with no manager anywhere up the tree;
 * - an active team without a supervisor;
 * - a manager or supervisor still in place whose person is inactive;
 * - a supervisor who works outside the team's department branch (Q-M3: shown, not refused).
 */
export function gaps(org: Org, moment: OrgMoment): Gap[] {
	const active = activeIds(org);
	const out: Gap[] = [];

	for (const department of org.departments) {
		if (!department.active) continue;
		if (!managerOn(ancestorChain(org.departments, department.id), org.managers, moment.date))
			out.push({ kind: 'department_without_manager', departmentId: department.id });
	}

	for (const [departmentId, staffId] of managersOn(org.managers, moment.date)) {
		if (!active.has(staffId)) out.push({ kind: 'inactive_manager', departmentId, staffId });
	}

	for (const team of org.teams) {
		if (!team.active) continue;
		const supervisors = supervisorsAt(org, team.id, moment.at);
		if (supervisors.length === 0) out.push({ kind: 'team_without_supervisor', teamId: team.id });
		const branch = team.departmentId
			? new Set([team.departmentId, ...descendantIds(org.departments, team.departmentId)])
			: null;
		for (const staffId of supervisors) {
			if (!active.has(staffId)) {
				out.push({ kind: 'inactive_supervisor', teamId: team.id, staffId });
				continue;
			}
			const person = org.people.find((p) => p.staffId === staffId);
			const department = person ? departmentOf(org, person, moment) : null;
			if (branch && department && !branch.has(department))
				out.push({ kind: 'supervisor_outside_branch', teamId: team.id, staffId });
		}
	}

	const key = (gap: Gap) =>
		[
			GAP_ORDER.indexOf(gap.kind),
			'departmentId' in gap ? gap.departmentId : '',
			'teamId' in gap ? gap.teamId : '',
			'staffId' in gap ? gap.staffId : ''
		].join('|');
	return out.sort((a, b) => key(a).localeCompare(key(b)));
}
