import type {
	RosterAbsence,
	RosterInput,
	RosterMembership,
	RosterOverrideEntry,
	RosterPattern
} from './roster.js';
import type { RosterShift } from './shift.js';

/**
 * Roster rows for several people at once (what the roster service loads); `rosterInputOf` picks
 * one person's input from it.
 */
export type RosterData = {
	shifts: readonly RosterShift[];
	memberships: readonly (RosterMembership & { staffId: string })[];
	personalPatterns: readonly (RosterPattern & { staffId: string | null })[];
	teamPatterns: readonly RosterPattern[];
	departmentPatterns: readonly RosterPattern[];
	/** Per person: their department, then its ancestors (nearest first). */
	departmentChains: Readonly<Record<string, string[]>>;
	overrides: readonly (RosterOverrideEntry & { staffId: string })[];
	absences: readonly (RosterAbsence & { staffId: string })[];
};

/** One person's `RosterInput` from the shared rows. */
export function rosterInputOf(data: RosterData, staffId: string): RosterInput {
	return {
		memberships: data.memberships.filter((m) => m.staffId === staffId),
		personalPatterns: data.personalPatterns.filter((p) => p.staffId === staffId),
		teamPatterns: data.teamPatterns,
		departmentPatterns: data.departmentPatterns,
		departmentChain: data.departmentChains[staffId] ?? [],
		overrides: data.overrides.filter((o) => o.staffId === staffId),
		absences: data.absences.filter((a) => a.staffId === staffId),
		shifts: new Map(data.shifts.map((s) => [s.id, s]))
	};
}
