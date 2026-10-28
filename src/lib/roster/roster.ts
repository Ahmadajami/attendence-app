import type { AbsenceType, ShiftKind } from '#lib/schemas/enums.js';
import type {
	Absence,
	RosterOverride,
	ShiftPattern,
	StaffTeamMembership
} from '#lib/server/db/schema/index.js';
import { addDays, cycleKind, shiftWindow, startOfDamascusDay, type ShiftTimes } from './cycle.js';

export type RosterPattern = Pick<
	ShiftPattern,
	'teamId' | 'cycle' | 'anchorDate' | 'dayStart' | 'nightStart' | 'effectiveFrom' | 'effectiveTo'
>;
export type RosterMembership = Pick<StaffTeamMembership, 'teamId' | 'validFrom' | 'validTo'>;
export type RosterOverrideEntry = Pick<RosterOverride, 'shiftDate' | 'kind' | 'swapGroupId'>;
export type RosterAbsence = Pick<Absence, 'startsOn' | 'endsOn' | 'type'>;

/** Everything that decides one person's roster. Cancelled overrides and absences are left out. */
export type RosterInput = {
	memberships: readonly RosterMembership[];
	/** This person's own cycle versions (admin staff, supervisors). */
	personalPatterns: readonly RosterPattern[];
	/** Cycle versions of the teams this person belongs to in the range. */
	teamPatterns: readonly RosterPattern[];
	overrides: readonly RosterOverrideEntry[];
	absences: readonly RosterAbsence[];
	/** Airport shift times, for an override on a date no cycle covers. */
	fallbackTimes: ShiftTimes | null;
};

/** Which rule decided the day, highest precedence first. */
export type RosterSource = 'absence' | 'override' | 'personal' | 'team' | 'none';

export type RosterDay = {
	date: string;
	/** The team on this date (`null`: none). */
	teamId: string | null;
	/** What the person should do: `off` also for an absence. */
	kind: ShiftKind;
	/** The shift's span; `null` when off, or when no shift times are known. */
	start: Date | null;
	end: Date | null;
	/** The shift times in force on this date. */
	times: ShiftTimes | null;
	source: RosterSource;
	/** What the cycle says, before overrides and absences (`off` without a cycle). */
	plannedKind: ShiftKind;
	/** A Day / Night override on a planned off day that isn't a swap: all of it is overtime. */
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

/** One person's roster for one date: absence → override → personal cycle → team cycle. */
export function rosterDay(input: RosterInput, date: string): RosterDay {
	const teamId = teamOnDate(input.memberships, date);
	const personal = patternOn(input.personalPatterns, date);
	const team =
		personal || teamId === null
			? undefined
			: patternOn(
					input.teamPatterns.filter((p) => p.teamId === teamId),
					date
				);
	const pattern = personal ?? team;
	const plannedKind = pattern ? cycleKind(pattern.cycle, pattern.anchorDate, date) : 'off';
	const times = pattern
		? { dayStart: pattern.dayStart, nightStart: pattern.nightStart }
		: input.fallbackTimes;

	const absence = input.absences.find((a) => a.startsOn <= date && date <= a.endsOn);
	if (absence) {
		return {
			date,
			teamId,
			kind: 'off',
			start: null,
			end: null,
			times,
			source: 'absence',
			plannedKind,
			extra: false,
			swapGroupId: null,
			absenceType: absence.type
		};
	}

	const override = input.overrides.find((o) => o.shiftDate === date);
	const kind = override?.kind ?? plannedKind;
	const window = kind !== 'off' && times ? shiftWindow(date, kind, times) : null;
	return {
		date,
		teamId,
		kind,
		start: window?.start ?? null,
		end: window?.end ?? null,
		times,
		source: override ? 'override' : personal ? 'personal' : team ? 'team' : 'none',
		plannedKind,
		extra:
			override !== undefined &&
			override.kind !== 'off' &&
			plannedKind === 'off' &&
			override.swapGroupId === null,
		swapGroupId: override?.swapGroupId ?? null,
		absenceType: null
	};
}

/** `days` consecutive roster days from `from`. */
export function rosterRange(input: RosterInput, from: string, days: number): RosterDay[] {
	return Array.from({ length: days }, (_, i) => rosterDay(input, addDays(from, i)));
}
