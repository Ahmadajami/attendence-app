import type { AbsenceType } from '#lib/schemas/enums.js';
import type {
	Absence,
	RosterOverride,
	ShiftPattern,
	StaffTeamMembership
} from '#lib/server/db/schema/index.js';
import { addDays, patternSlot, startOfDamascusDay } from './cycle.js';
import { shiftWindow, type RosterShift } from './shift.js';

export type RosterPattern = Pick<
	ShiftPattern,
	'teamId' | 'departmentId' | 'type' | 'slots' | 'anchorDate' | 'effectiveFrom' | 'effectiveTo'
>;
export type RosterMembership = Pick<StaffTeamMembership, 'teamId' | 'validFrom' | 'validTo'>;
export type RosterOverrideEntry = Pick<RosterOverride, 'shiftDate' | 'shiftId' | 'swapGroupId'>;
export type RosterAbsence = Pick<Absence, 'startsOn' | 'endsOn' | 'type'>;

/** Everything that decides one person's roster. Cancelled overrides and absences are left out. */
export type RosterInput = {
	memberships: readonly RosterMembership[];
	/** This person's own pattern versions (admin staff, supervisors). */
	personalPatterns: readonly RosterPattern[];
	/** Pattern versions of the teams this person belongs to in the range. */
	teamPatterns: readonly RosterPattern[];
	/** Pattern versions of the departments in `departmentChain`. */
	departmentPatterns: readonly RosterPattern[];
	/** The person's department, then its ancestors: nearest first. */
	departmentChain: readonly string[];
	overrides: readonly RosterOverrideEntry[];
	absences: readonly RosterAbsence[];
	/** Every shift a pattern or override may point at, by id (inactive ones too). */
	shifts: ReadonlyMap<string, RosterShift>;
};

/** Which rule decided the day, highest precedence first. */
export type RosterSource = 'absence' | 'override' | 'personal' | 'team' | 'department' | 'none';

export type RosterDay = {
	date: string;
	/** The team on this date (`null`: none). */
	teamId: string | null;
	/** The shift to work; `null` when off, also for an absence. */
	shiftId: string | null;
	shift: RosterShift | null;
	/** The shift's span; `null` when off. */
	start: Date | null;
	end: Date | null;
	source: RosterSource;
	/** What the pattern says, before overrides and absences (`null`: off or no pattern). */
	plannedShiftId: string | null;
	/** A shift override on a planned off day that isn't a swap: all of it is overtime. */
	extra: boolean;
	swapGroupId: string | null;
	absenceType: AbsenceType | null;
};

/**
 * The team on a shift date: the membership open at 00:00 Damascus that day. Moves take effect at
 * 00:00 of their effective date, so a night shift that starts the evening before a move still
 * belongs to the old team.
 */
export function teamOnDate(memberships: readonly RosterMembership[], date: string): string | null {
	const at = startOfDamascusDay(date).getTime();
	const open = memberships.find(
		(m) => m.validFrom.getTime() <= at && (m.validTo === null || at < m.validTo.getTime())
	);
	return open?.teamId ?? null;
}

/** The version in force on `date` (`effective_to` is exclusive; `null` is open). */
export function patternOn<T extends Pick<RosterPattern, 'effectiveFrom' | 'effectiveTo'>>(
	versions: readonly T[],
	date: string
): T | undefined {
	return versions.find(
		(v) => v.effectiveFrom <= date && (v.effectiveTo === null || date < v.effectiveTo)
	);
}

/** The pattern that plans `date`: personal → team → department (nearest first). */
function plannedPattern(
	input: RosterInput,
	teamId: string | null,
	date: string
): { pattern: RosterPattern; source: 'personal' | 'team' | 'department' } | null {
	const personal = patternOn(input.personalPatterns, date);
	if (personal) return { pattern: personal, source: 'personal' };
	if (teamId !== null) {
		const team = patternOn(
			input.teamPatterns.filter((p) => p.teamId === teamId),
			date
		);
		if (team) return { pattern: team, source: 'team' };
	}
	for (const departmentId of input.departmentChain) {
		const department = patternOn(
			input.departmentPatterns.filter((p) => p.departmentId === departmentId),
			date
		);
		if (department) return { pattern: department, source: 'department' };
	}
	return null;
}

/**
 * One person's roster for one date: absence → override → personal → team → department (nearest
 * first) → off.
 */
export function rosterDay(input: RosterInput, date: string): RosterDay {
	const teamId = teamOnDate(input.memberships, date);
	const planned = plannedPattern(input, teamId, date);
	const plannedShiftId = planned ? patternSlot(planned.pattern, date) : null;

	const absence = input.absences.find((a) => a.startsOn <= date && date <= a.endsOn);
	if (absence) {
		return {
			date,
			teamId,
			shiftId: null,
			shift: null,
			start: null,
			end: null,
			source: 'absence',
			plannedShiftId,
			extra: false,
			swapGroupId: null,
			absenceType: absence.type
		};
	}

	const override = input.overrides.find((o) => o.shiftDate === date);
	const shiftId = override ? override.shiftId : plannedShiftId;
	const shift = shiftId === null ? null : (input.shifts.get(shiftId) ?? null);
	const window = shift ? shiftWindow(date, shift) : null;
	return {
		date,
		teamId,
		shiftId,
		shift,
		start: window?.start ?? null,
		end: window?.end ?? null,
		source: override ? 'override' : (planned?.source ?? 'none'),
		plannedShiftId,
		extra:
			override !== undefined &&
			override.shiftId !== null &&
			plannedShiftId === null &&
			override.swapGroupId === null,
		swapGroupId: override?.swapGroupId ?? null,
		absenceType: null
	};
}

/** `days` consecutive roster days from `from`. */
export function rosterRange(input: RosterInput, from: string, days: number): RosterDay[] {
	return Array.from({ length: days }, (_, i) => rosterDay(input, addDays(from, i)));
}
