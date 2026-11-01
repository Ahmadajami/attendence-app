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

// ---- The management tree of one person (plans/2026-11-01-employee-management-tree.md) ----

export type LadderStep =
	| { level: 'supervisor'; staffId: string; teamId: string; approves: true }
	| { level: 'manager'; staffId: string; departmentId: string; approves: boolean }
	| { level: 'hr'; approves: true };

/**
 * The line up from `staffId` (M16): `chainOf` (supervisors → nearest manager → HR, the ones who
 * approve), with every active manager further up the department tree inserted before HR, each
 * once and marked `approves: false` (they see the person, Q-M4, but don't approve first). Never
 * the person themself.
 */
export function ladderOf(staffId: string, moment: OrgMoment, org: Org): LadderStep[] {
	const chain = chainOf(staffId, moment, org);
	const active = activeIds(org);
	const steps: LadderStep[] = [];
	const listed = new Set<string>([staffId]);
	let nearest: string | null = null;

	for (const step of chain) {
		if (step.level === 'supervisor') {
			steps.push({ ...step, approves: true });
			listed.add(step.staffId);
		} else if (step.level === 'manager') {
			steps.push({ ...step, approves: true });
			listed.add(step.staffId);
			nearest = step.departmentId;
		}
	}

	if (nearest) {
		const parentOf = new Map(org.departments.map((d) => [d.id, d.parentId]));
		const byDepartment = managersOn(org.managers, moment.date);
		for (const departmentId of ancestorChain(org.departments, parentOf.get(nearest) ?? null)) {
			const manager = byDepartment.get(departmentId);
			if (!manager || listed.has(manager) || !active.has(manager)) continue;
			steps.push({ level: 'manager', staffId: manager, departmentId, approves: false });
			listed.add(manager);
		}
	}

	steps.push({ level: 'hr', approves: true });
	return steps;
}

export type ReportNode =
	| {
			kind: 'manager';
			staffId: string;
			/** The sub-department(s) they manage under this parent. */
			departmentIds: string[];
			/** People in the subtree. */
			count: number;
			children: ReportNode[];
	  }
	| {
			kind: 'supervisor';
			staffId: string;
			/** The team(s) they supervise under this parent. */
			teamIds: string[];
			count: number;
			children: ReportNode[];
	  }
	| { kind: 'person'; staffId: string };

const KIND_ORDER: ReportNode['kind'][] = ['manager', 'supervisor', 'person'];

type TreeContext = {
	/** Whose tree it is: never shown anywhere in it. */
	root: string;
	org: Org;
	moment: OrgMoment;
	active: Set<string>;
	managers: Map<string, string>;
	childrenOf: Map<string, string[]>;
};

/** Nodes with the same person under one parent become one; leaves of a node's person go. */
function mergeNodes(nodes: readonly ReportNode[]): ReportNode[] {
	const managers = new Map<string, Extract<ReportNode, { kind: 'manager' }>>();
	const supervisors = new Map<string, Extract<ReportNode, { kind: 'supervisor' }>>();
	const people = new Set<string>();

	for (const node of nodes) {
		if (node.kind === 'manager') {
			const seen = managers.get(node.staffId);
			if (seen) {
				seen.departmentIds = [...new Set([...seen.departmentIds, ...node.departmentIds])];
				seen.children = [...seen.children, ...node.children];
			} else managers.set(node.staffId, { ...node, children: [...node.children] });
		}
	}
	for (const node of nodes) {
		if (node.kind !== 'supervisor') continue;
		const asManager = managers.get(node.staffId);
		if (asManager) {
			// Manages a sub-department too: their team members go under that one node.
			asManager.children = [...asManager.children, ...node.children];
			continue;
		}
		const seen = supervisors.get(node.staffId);
		if (seen) {
			seen.teamIds = [...new Set([...seen.teamIds, ...node.teamIds])];
			seen.children = [...seen.children, ...node.children];
		} else supervisors.set(node.staffId, { ...node, children: [...node.children] });
	}
	for (const node of nodes) {
		if (node.kind === 'person' && !managers.has(node.staffId) && !supervisors.has(node.staffId))
			people.add(node.staffId);
	}

	return [
		...managers.values(),
		...supervisors.values(),
		...[...people].map((staffId): ReportNode => ({ kind: 'person', staffId }))
	];
}

/** Merge every level, count each subtree's people, sort (managers, supervisors, people; by id). */
function finalize(nodes: readonly ReportNode[]): ReportNode[] {
	return mergeNodes(nodes)
		.map((node): ReportNode => {
			if (node.kind === 'person') return node;
			const children = finalize(node.children);
			return { ...node, children, count: subtreePeople(children).size };
		})
		.sort(
			(a, b) =>
				KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
				a.staffId.localeCompare(b.staffId)
		);
}

/** Everyone in `nodes` and below (nodes' own people included). */
export function subtreePeople(nodes: readonly ReportNode[]): Set<string> {
	const out = new Set<string>();
	const visit = (list: readonly ReportNode[]) => {
		for (const node of list) {
			out.add(node.staffId);
			if (node.kind !== 'person') visit(node.children);
		}
	};
	visit(nodes);
	return out;
}

/**
 * What `self` manages from department `root` (M17): sub-departments with their own active
 * manager become that manager's node (their branch below them); the rest is `self`'s branch,
 * where each team's active supervisors become nodes holding the team's members, and everyone
 * else working there is a leaf (no team, or a team nobody else supervises).
 */
function branchNodes(
	root: string,
	self: string,
	ctx: TreeContext
): { nodes: ReportNode[]; departments: Set<string> } {
	const { root: owner, org, moment, active, managers, childrenOf } = ctx;
	const departments = new Set<string>();
	const stops: [string, string][] = [];
	const stack = [root];
	while (stack.length > 0) {
		const departmentId = stack.pop() as string;
		if (departments.has(departmentId)) continue;
		departments.add(departmentId);
		for (const child of childrenOf.get(departmentId) ?? []) {
			const manager = managers.get(child);
			if (manager && manager !== self && manager !== owner && active.has(manager))
				stops.push([child, manager]);
			else stack.push(child);
		}
	}

	const nodes: ReportNode[] = stops.map(([departmentId, manager]) => ({
		kind: 'manager',
		staffId: manager,
		departmentIds: [departmentId],
		count: 0,
		children: branchNodes(departmentId, manager, ctx).nodes
	}));

	const supervised = new Map<string, Set<string>>();
	const supervisedTeams = new Set<string>();
	for (const team of org.teams) {
		if (!team.departmentId || !departments.has(team.departmentId)) continue;
		for (const supervisor of supervisorsAt(org, team.id, moment.at)) {
			if (supervisor === self || supervisor === owner || !active.has(supervisor)) continue;
			supervised.set(supervisor, (supervised.get(supervisor) ?? new Set()).add(team.id));
			supervisedTeams.add(team.id);
		}
	}

	for (const [supervisor, teamIds] of supervised) {
		const members = org.people.filter((p) => {
			if ([self, owner, supervisor].includes(p.staffId) || !active.has(p.staffId)) return false;
			const teamId = teamAt(org, p.staffId, moment.at);
			return teamId !== null && teamIds.has(teamId);
		});
		nodes.push({
			kind: 'supervisor',
			staffId: supervisor,
			teamIds: [...teamIds].sort(),
			count: 0,
			children: members.map((p) => ({ kind: 'person', staffId: p.staffId }))
		});
	}

	for (const person of org.people) {
		if (!active.has(person.staffId) || person.staffId === self || person.staffId === owner)
			continue;
		const departmentId = departmentOf(org, person, moment);
		if (!departmentId || !departments.has(departmentId)) continue;
		const teamId = teamAt(org, person.staffId, moment.at);
		if (teamId && supervisedTeams.has(teamId)) continue;
		nodes.push({ kind: 'person', staffId: person.staffId });
	}

	return { nodes, departments };
}

/**
 * The people below `staffId` on that day, as a tree (M17). As a manager: their department(s) and
 * everything under them (sub-departments with their own manager as that manager's node). As a
 * supervisor: their teams' members (also teams outside their own branch). Everyone in the tree is
 * exactly `scopeOf(...).people`; active people only, never the person themself.
 */
export function reportsOf(staffId: string, moment: OrgMoment, org: Org): ReportNode[] {
	const childrenOf = new Map<string, string[]>();
	for (const department of org.departments) {
		if (department.parentId)
			childrenOf.set(department.parentId, [
				...(childrenOf.get(department.parentId) ?? []),
				department.id
			]);
	}
	const ctx: TreeContext = {
		root: staffId,
		org,
		moment,
		active: activeIds(org),
		managers: managersOn(org.managers, moment.date),
		childrenOf
	};

	const managed = [...ctx.managers]
		.filter(([, manager]) => manager === staffId)
		.map(([departmentId]) => departmentId);
	const tops = managed
		.filter(
			(id) =>
				!managed.some((other) => other !== id && descendantIds(org.departments, other).has(id))
		)
		.sort();

	const nodes: ReportNode[] = [];
	const ownBranch = new Set<string>();
	for (const departmentId of tops) {
		const branch = branchNodes(departmentId, staffId, ctx);
		nodes.push(...branch.nodes);
		for (const id of branch.departments) ownBranch.add(id);
	}

	// Teams they supervise outside their own branch: the members, directly.
	for (const s of org.supervisors) {
		if (s.staffId !== staffId || !inForceAt(s.addedAt, s.removedAt, moment.at)) continue;
		const team = org.teams.find((t) => t.id === s.teamId);
		if (team?.departmentId && ownBranch.has(team.departmentId)) continue;
		for (const person of org.people) {
			if (!ctx.active.has(person.staffId) || person.staffId === staffId) continue;
			if (teamAt(org, person.staffId, moment.at) === s.teamId)
				nodes.push({ kind: 'person', staffId: person.staffId });
		}
	}

	return finalize(nodes);
}
