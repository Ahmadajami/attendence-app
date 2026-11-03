import type {
	RosterAbsence,
	RosterAssignment,
	RosterHoliday,
	RosterHolidayException,
	RosterInput,
	RosterMembership,
	RosterOverrideEntry,
	RosterSchedule
} from './roster.js';
import type { RosterShift } from './shift.js';

/**
 * Roster rows for several people at once (what the roster service loads); `rosterInputOf` picks
 * one person's input from it.
 */
export type RosterData = {
	shifts: readonly RosterShift[];
	memberships: readonly (RosterMembership & { staffId: string })[];
	personalAssignments: readonly (RosterAssignment & { staffId: string | null })[];
	teamAssignments: readonly RosterAssignment[];
	departmentAssignments: readonly RosterAssignment[];
	/** Per person: their department, then its ancestors (nearest first). */
	departmentChains: Readonly<Record<string, string[]>>;
	schedules: readonly (RosterSchedule & { staffId: string })[];
	overrides: readonly (RosterOverrideEntry & { staffId: string })[];
	absences: readonly (RosterAbsence & { staffId: string })[];
	/** Active holidays of the patterns above and the company's (pay plan PR8, PR36). */
	holidays?: readonly RosterHoliday[];
	/** Those patterns' exceptions to company holidays (PR36). */
	holidayExceptions?: readonly RosterHolidayException[];
};

/** One person's `RosterInput` from the shared rows. */
export function rosterInputOf(data: RosterData, staffId: string): RosterInput {
	return {
		memberships: data.memberships.filter((m) => m.staffId === staffId),
		personalAssignments: data.personalAssignments.filter((a) => a.staffId === staffId),
		teamAssignments: data.teamAssignments,
		departmentAssignments: data.departmentAssignments,
		departmentChain: data.departmentChains[staffId] ?? [],
		schedules: data.schedules.filter((s) => s.staffId === staffId),
		overrides: data.overrides.filter((o) => o.staffId === staffId),
		absences: data.absences.filter((a) => a.staffId === staffId),
		holidays: data.holidays ?? [],
		holidayExceptions: data.holidayExceptions ?? [],
		shifts: new Map(data.shifts.map((s) => [s.id, s]))
	};
}
