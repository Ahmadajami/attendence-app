import type {
	AbsenceType,
	DayKind,
	PatternType,
	RosterSource,
	SwapRole
} from '#lib/schemas/enums.js';
import { addDays, mostUsedShift, patternSlot, startOfDamascusDay, weekdayOf } from './cycle.js';
import { shiftWindow, type RosterShift } from './shift.js';

/**
 * A `pattern_assignment` joined with its `pattern` (builder plan B1). `teamId` / `departmentId` say
 * which target it belongs to (`null` on a personal one). `anchorDate` is the cycle's slot 0 for this
 * target (B4); `effectiveTo` is exclusive, `null` while open.
 */
export type RosterAssignment = {
	id: string;
	patternId: string;
	teamId: string | null;
	departmentId: string | null;
	type: PatternType;
	slots: (string | null)[];
	/** Weekly: the shift for a day the person works although the pattern has it off (B5). */
	defaultWorkShiftId: string | null;
	anchorDate: string | null;
	effectiveFrom: string;
	effectiveTo: string | null;
};

/**
 * One version of a person's own schedule rules (`staff_schedule`, B4/B5): own off days (0 = Sunday …
 * 6 = Saturday) for weekly patterns, a crew start (slot offset) for cycles. `null`: follow the
 * pattern.
 */
export type RosterSchedule = {
	offWeekdays: readonly number[] | null;
	crewStart: number | null;
	effectiveFrom: string;
	effectiveTo: string | null;
};

export type RosterMembership = { teamId: string; validFrom: Date; validTo: Date | null };
export type RosterOverrideEntry = {
	shiftDate: string;
	shiftId: string | null;
	swapGroupId: string | null;
};
export type RosterAbsence = { startsOn: string; endsOn: string; type: AbsenceType };

/**
 * An active (not cancelled) holiday of a pattern (pay plan PR2, PR3, PR8), or of the company
 * (`patternId` `null`, PR36): shift dates `startsOn` to `endsOn` inclusive.
 */
export type RosterHoliday = {
	id: string;
	patternId: string | null;
	startsOn: string;
	endsOn: string;
	otEligible: boolean;
};

/**
 * How a pattern treats a company holiday (PR36): skipped (`applies` false), or with its own
 * overtime-eligible switch (`otEligible`, `null`: as the company's).
 */
export type RosterHolidayException = {
	patternId: string;
	holidayId: string;
	applies: boolean;
	otEligible: boolean | null;
};

/** Everything that decides one person's roster. Cancelled overrides and absences are left out. */
export type RosterInput = {
	memberships: readonly RosterMembership[];
	/** This person's own assignments (admin staff, supervisors). */
	personalAssignments: readonly RosterAssignment[];
	/** Assignments of the teams this person belongs to in the range. */
	teamAssignments: readonly RosterAssignment[];
	/** Assignments of the departments in `departmentChain`. */
	departmentAssignments: readonly RosterAssignment[];
	/** The person's department, then its ancestors: nearest first. */
	departmentChain: readonly string[];
	/** This person's own off days / crew start versions. */
	schedules: readonly RosterSchedule[];
	overrides: readonly RosterOverrideEntry[];
	absences: readonly RosterAbsence[];
	/** Active holidays of the patterns that may plan the range, and the company's (empty when not loaded). */
	holidays?: readonly RosterHoliday[];
	/** Those patterns' exceptions to company holidays. */
	holidayExceptions?: readonly RosterHolidayException[];
	/** Every shift a pattern or override may point at, by id (inactive ones too). */
	shifts: ReadonlyMap<string, RosterShift>;
};

/** Which rule decided the day, highest precedence first. */
export type { RosterSource };

/**
 * How the person's own rules changed the pattern's day (weekly, B5): `own_off` = a listed own off
 * day; `own_work` = a pattern off day they work (with the pattern's default work shift).
 */
export type RosterAdjustment = 'own_off' | 'own_work';

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
	/** What the assignment plans (after own off days and crew start), before overrides and absences. */
	plannedShiftId: string | null;
	/** The assignment that plans the day, also under an override or absence (`null`: none). */
	assignmentId: string | null;
	patternId: string | null;
	adjustment: RosterAdjustment | null;
	/** A shift override on a planned off day that isn't a swap: all of it is overtime. */
	extra: boolean;
	swapGroupId: string | null;
	/** What an approved swap made of the day: work (`swap_on`) or off (`swap_off`), R12. */
	swapRole: SwapRole | null;
	absenceType: AbsenceType | null;
	/**
	 * A holiday of the planning pattern on this date (PR8): the day is off (required 0) unless an
	 * override gives a shift, which is then holiday work. Also set under an absence.
	 */
	holiday: { id: string; otEligible: boolean } | null;
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
export function patternOn<T extends { effectiveFrom: string; effectiveTo: string | null }>(
	versions: readonly T[],
	date: string
): T | undefined {
	return versions.find(
		(v) => v.effectiveFrom <= date && (v.effectiveTo === null || date < v.effectiveTo)
	);
}

type Planned = { assignment: RosterAssignment; source: 'personal' | 'team' | 'department' };

/** The assignment that plans `date`: personal → team → department (nearest first, B6). */
function plannedAssignment(
	input: RosterInput,
	teamId: string | null,
	date: string
): Planned | null {
	const personal = patternOn(input.personalAssignments, date);
	if (personal) return { assignment: personal, source: 'personal' };
	if (teamId !== null) {
		const team = patternOn(
			input.teamAssignments.filter((a) => a.teamId === teamId),
			date
		);
		if (team) return { assignment: team, source: 'team' };
	}
	for (const departmentId of input.departmentChain) {
		const department = patternOn(
			input.departmentAssignments.filter((a) => a.departmentId === departmentId),
			date
		);
		if (department) return { assignment: department, source: 'department' };
	}
	return null;
}

/**
 * The planned shift once the person's own rules apply (B2 step 4). They adjust an inherited (team or
 * department) assignment only: a personal one already describes the person's own days. Cycle: the
 * crew start shifts the slot (B4). Weekly: a listed own off day is off; a day the pattern has off
 * but the person doesn't list is worked, with the pattern's default work shift (B5).
 */
function plannedShift(
	planned: Planned,
	schedule: RosterSchedule | undefined,
	date: string
): { shiftId: string | null; adjustment: RosterAdjustment | null } {
	const { assignment, source } = planned;
	const own = source === 'personal' ? undefined : schedule;
	const shiftId = patternSlot(assignment, date, own?.crewStart ?? 0);
	if (assignment.type !== 'weekly' || !own?.offWeekdays) return { shiftId, adjustment: null };

	if (own.offWeekdays.includes(weekdayOf(date)))
		return { shiftId: null, adjustment: shiftId === null ? null : 'own_off' };
	if (shiftId !== null) return { shiftId, adjustment: null };
	return {
		shiftId: assignment.defaultWorkShiftId ?? mostUsedShift(assignment.slots),
		adjustment: 'own_work'
	};
}

/**
 * The holiday on `date` of the day's planning pattern: its own holiday first (PR37), else a company
 * holiday unless the pattern skips it, with the pattern's overtime switch when it has one (PR36). A
 * day no pattern plans has none.
 */
function holidayOn(
	input: Pick<RosterInput, 'holidays' | 'holidayExceptions'>,
	patternId: string | null,
	date: string
): RosterDay['holiday'] {
	if (patternId === null || !input.holidays) return null;
	const covers = (h: RosterHoliday) => h.startsOn <= date && date <= h.endsOn;
	const own = input.holidays.find((h) => h.patternId === patternId && covers(h));
	if (own) return { id: own.id, otEligible: own.otEligible };
	const company = input.holidays.find((h) => h.patternId === null && covers(h));
	if (!company) return null;
	const exception = input.holidayExceptions?.find(
		(e) => e.patternId === patternId && e.holidayId === company.id
	);
	if (exception && !exception.applies) return null;
	return { id: company.id, otEligible: exception?.otEligible ?? company.otEligible };
}

/**
 * One person's roster for one date: absence → override → holiday of the planning pattern → personal
 * → team → department (nearest first) → off; own off days and crew start adjust an inherited
 * assignment's day.
 */
export function rosterDay(input: RosterInput, date: string): RosterDay {
	const teamId = teamOnDate(input.memberships, date);
	const planned = plannedAssignment(input, teamId, date);
	const { shiftId: plannedShiftId, adjustment } = planned
		? plannedShift(planned, patternOn(input.schedules, date), date)
		: { shiftId: null, adjustment: null };
	const plan = {
		plannedShiftId,
		assignmentId: planned?.assignment.id ?? null,
		patternId: planned?.assignment.patternId ?? null,
		adjustment
	};

	const holiday = holidayOn(input, plan.patternId, date);
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
			...plan,
			extra: false,
			swapGroupId: null,
			swapRole: null,
			absenceType: absence.type,
			holiday
		};
	}

	const override = input.overrides.find((o) => o.shiftDate === date);
	// A holiday makes the planned day off; only an override (one-off shift or swap) works it.
	const shiftId = override ? override.shiftId : holiday ? null : plannedShiftId;
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
		...plan,
		extra:
			override !== undefined &&
			override.shiftId !== null &&
			plannedShiftId === null &&
			override.swapGroupId === null,
		swapGroupId: override?.swapGroupId ?? null,
		swapRole:
			override?.swapGroupId == null ? null : override.shiftId === null ? 'swap_off' : 'swap_on',
		absenceType: null,
		holiday
	};
}

/**
 * How a day is paid (pay plan §4): a full-day absence first; on a holiday, worked or not; a day a
 * swap moved onto work counts as off-day work when the swap is "pay as overtime" (PR28); an extra
 * shift or work on a planned off day is off-day work.
 */
export function payDayKind(
	day: Pick<RosterDay, 'source' | 'shiftId' | 'extra' | 'swapRole' | 'holiday'>,
	worked: boolean,
	payAsOt = false
): DayKind {
	if (day.source === 'absence') return 'absence';
	if (day.holiday) return day.shiftId !== null || worked ? 'holiday_work' : 'holiday_off';
	if (day.shiftId === null) return worked ? 'off_work' : 'off';
	if (day.extra || (day.swapRole === 'swap_on' && payAsOt)) return 'off_work';
	return 'work';
}

/** `days` consecutive roster days from `from`. */
export function rosterRange(input: RosterInput, from: string, days: number): RosterDay[] {
	return Array.from({ length: days }, (_, i) => rosterDay(input, addDays(from, i)));
}
