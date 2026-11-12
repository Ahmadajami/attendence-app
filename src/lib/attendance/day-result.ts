import { overtimePay, type ResolvedPayRule } from '#lib/payroll/pay-rule.js';
import {
	DEFAULT_RESOLVED,
	roundingOf,
	type ResolvedAttendanceRules
} from '#lib/roster/attendance-rules.js';
import { shiftSummary, type AttendanceEntry } from '#lib/roster/attendance.js';
import { computeOvertime } from '#lib/roster/overtime.js';
import { payDayKind, type RosterDay } from '#lib/roster/roster.js';
import { requiredOf } from '#lib/roster/shift.js';
import type {
	AbsenceType,
	DayKind,
	DayStatus,
	LogField,
	PunchSource,
	RosterSource,
	SwapRole,
	UnpaidReason
} from '#lib/schemas/enums.js';

// One person's stored daily attendance (pay plan PR16, §4): built from the roster day, the events
// counted for it and the pay rule. Pure: the recompute service (Phase 3) loads the inputs, writes
// the row and the edit-log lines from `diffDayResult`. Client-safe: no Node or server imports.

/**
 * Bump when the rules below change what a day's figures are, so every stored row is rewritten on
 * the next recompute (it is part of the hash).
 */
export const DAY_RESULT_ENGINE = 2;

/** The computed columns of a `day_result` row (ids, timestamps and flags of the store excluded). */
export type DayResultValues = {
	staffId: string;
	shiftDate: string;
	kind: DayKind;
	status: DayStatus;
	source: RosterSource;
	patternId: string | null;
	shiftId: string | null;
	teamId: string | null;
	holidayId: string | null;
	absenceType: AbsenceType | null;
	/** ISO instants, so the values compare and hash the same after a round trip. */
	checkIn: string | null;
	checkOut: string | null;
	checkInSource: PunchSource | null;
	checkOutSource: PunchSource | null;
	corrected: boolean;
	requiredMinutes: number;
	workedMinutes: number | null;
	/** Friday Prayer credit (FP1): paid, counts toward the required time, never overtime. */
	creditMinutes: number;
	/** Required minutes not covered by worked time and credit. */
	shortageMinutes: number;
	/** Credit left over after the shortage: paid as extra time. */
	creditExtraMinutes: number;
	lateMinutes: number;
	overtimeMinutes: number;
	otRate: number | null;
	paidOtMinutes: number;
	unpaidExtraMinutes: number;
	unpaidReason: UnpaidReason | null;
	swapRequestId: string | null;
	swapRole: SwapRole | null;
	unauthSwap: boolean;
	/** Ids, sources and steps only: never names or absence reasons. */
	explanation: Record<string, unknown>;
};

/** What the screens show of a stored day: every value but the explanation (pay plan PR20, PR24). */
export type DayFigures = Omit<DayResultValues, 'explanation'>;

export function dayFiguresOf(values: DayResultValues): DayFigures {
	const { explanation: _explanation, ...figures } = values;
	void _explanation;
	return figures;
}

export type DayResultInput = {
	staffId: string;
	day: RosterDay;
	/** The person's events counted for this shift date (corrected ones too). */
	events: readonly AttendanceEntry[];
	/** The pattern's pay rule on this date (`resolvePayRule`). */
	pay: ResolvedPayRule;
	/** The approved swap behind the day's override (`swap_group_id`), if any. */
	swap: { id: string; payAsOt: boolean } | null;
	/** `false`: the person earns no overtime (S3.6, later). */
	otEligible?: boolean;
	/** The attendance rules on this date (`attendanceRulesOn`); the defaults when omitted. */
	rules?: ResolvedAttendanceRules;
	now: Date;
};

/** The day's stored figures. */
export function dayResultOf(input: DayResultInput): DayResultValues {
	const { day, pay } = input;
	const resolved = input.rules ?? DEFAULT_RESOLVED;
	const summary = shiftSummary(day, input.events, input.now, null, resolved.rules);
	const worked = summary.checkIn !== null;
	const kind = payDayKind(day, worked, input.swap?.payAsOt ?? false);
	// A "pay as overtime" swap day (PR28) is off-day work: every minute counts, not only the excess.
	const swapAsOt = kind === 'off_work' && day.swapRole === 'swap_on';
	const extra =
		swapAsOt && summary.workedMinutes !== null
			? computeOvertime(summary.workedMinutes, 0, true, roundingOf(resolved.rules)).minutes
			: (summary.overtime?.minutes ?? 0);
	const paid = overtimePay(kind, extra, pay.rule, {
		otEligible: input.otEligible,
		holidayOtEligible: day.holiday?.otEligible
	});
	// Worked a planned off day with no override behind it (R12): shown, not penalised. A day off
	// that an approved swap made (`swapRole`) has a swap behind it, so it is never "without a swap".
	const unauthSwap =
		kind === 'off_work' && day.shiftId === null && day.holiday === null && day.swapRole === null;
	const swapRequestId = day.swapRole !== null ? (input.swap?.id ?? day.swapGroupId) : null;

	return {
		staffId: input.staffId,
		shiftDate: day.date,
		kind,
		status: summary.status,
		source: day.source,
		patternId: day.patternId,
		shiftId: summary.shiftId,
		teamId: day.teamId,
		holidayId: day.holiday?.id ?? null,
		absenceType: day.absenceType,
		checkIn: summary.checkIn?.toISOString() ?? null,
		checkOut: summary.checkOut?.toISOString() ?? null,
		checkInSource: summary.checkInSource,
		checkOutSource: summary.checkOutSource,
		corrected: summary.corrected,
		requiredMinutes: kind === 'work' && day.shift ? requiredOf(day.shift) : 0,
		workedMinutes: summary.workedMinutes,
		creditMinutes: summary.creditMinutes,
		shortageMinutes: summary.shortageMinutes,
		creditExtraMinutes: summary.creditExtraMinutes,
		lateMinutes: kind === 'work' ? summary.lateMinutes : 0,
		overtimeMinutes: extra,
		otRate: paid.rate,
		paidOtMinutes: paid.paidMinutes,
		unpaidExtraMinutes: paid.unpaidMinutes,
		unpaidReason: paid.reason,
		swapRequestId,
		swapRole: swapRequestId === null ? null : day.swapRole,
		unauthSwap,
		explanation: {
			engine: DAY_RESULT_ENGINE,
			assignmentId: day.assignmentId,
			plannedShiftId: day.plannedShiftId,
			adjustment: day.adjustment,
			extra: day.extra,
			paySources: pay.sources,
			attendanceRules: {
				versionId: resolved.versionId,
				source: resolved.source,
				rules: resolved.rules
			},
			eventIds: input.events.map((e) => e.id)
		}
	};
}

/** Keys in a fixed order, so the same values always give the same text. */
function stable(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
}

/**
 * The row's fingerprint (stored as `inputs_hash`): FNV-1a over the computed values and the engine
 * version, as 16 hex digits. Hashing the result rather than the inputs also catches figures that
 * depend on the time (expected → missing today), so an unchanged row is never rewritten and a
 * changed one always is.
 */
export function dayResultHash(values: DayResultValues): string {
	const text = `${DAY_RESULT_ENGINE}|${stable(values)}`;
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
	}
	return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export type LogValue = string | number | boolean | null;
export type DayChange = { field: LogField; oldValue: LogValue; newValue: LogValue };

/** The values the edit log tracks (PR22), by log field. */
const TRACKED: readonly [LogField, (v: DayResultValues) => LogValue][] = [
	['kind', (v) => v.kind],
	['status', (v) => v.status],
	['state', (v) => v.absenceType],
	['shift', (v) => v.shiftId],
	['check_in', (v) => v.checkIn],
	['check_out', (v) => v.checkOut],
	['required', (v) => v.requiredMinutes],
	['worked', (v) => v.workedMinutes],
	['late', (v) => v.lateMinutes],
	['overtime', (v) => v.overtimeMinutes],
	['ot_rate', (v) => v.otRate],
	['paid_ot', (v) => v.paidOtMinutes],
	['unpaid_extra', (v) => v.unpaidExtraMinutes],
	['swap', (v) => v.swapRole]
];

/**
 * The edit-log lines between the stored row and the new one: one per changed tracked value, in a
 * fixed order. A day computed for the first time gives a single `created` line (its kind).
 */
export function diffDayResult(
	previous: DayResultValues | null,
	next: DayResultValues
): DayChange[] {
	if (previous === null) return [{ field: 'created', oldValue: null, newValue: next.kind }];
	const changes: DayChange[] = [];
	for (const [field, read] of TRACKED) {
		const oldValue = read(previous);
		const newValue = read(next);
		if (oldValue !== newValue) changes.push({ field, oldValue, newValue });
	}
	return changes;
}
