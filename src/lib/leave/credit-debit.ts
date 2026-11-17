// Pure annual-leave debit conversion planner (B1).
// No database, settings, balance or ledger access; callers supply already-selected rule values.

/** Where the divisor minutes came from. */
export type DivisorSource = 'scheduled' | 'normal_workday' | 'off_day_override';

/** Input describing the credit minutes and the divisor candidates for one day. */
export type PlanLeaveDebitInput = {
	/** Positive attendance-credit minutes HR intends to debit. */
	creditMinutes: number;
	/** Whether the affected day is a weekly off day. */
	isOffDay: boolean;
	/** Required minutes scheduled for this working day (may be 0 on an off day). */
	scheduledMinutes: number;
	/** Employee normal-workday required minutes, when known. */
	normalMinutes: number | null;
	/** Optional company off-day conversion override in minutes; null/absent/undefined means unset. */
	offDayOverrideMinutes?: number | null;
};

/** Successful plan: unrounded day fraction and the divisor that produced it. */
export type LeaveDebitPlan = {
	kind: 'ok';
	creditMinutes: number;
	divisorMinutes: number;
	dayFraction: number;
	divisorSource: DivisorSource;
	/** Preserved inputs needed to explain or reverse a future posted debit. */
	inputs: {
		isOffDay: boolean;
		scheduledMinutes: number;
		normalMinutes: number | null;
		offDayOverrideMinutes: number | null;
	};
};

/** Internal reason codes for failures; callers map to user-facing messages. */
export type LeaveDebitErrorCode = 'invalid_credit_minutes' | 'missing_divisor' | 'invalid_divisor';

export type LeaveDebitFailure = {
	kind: 'error';
	code: LeaveDebitErrorCode;
};

export type LeaveDebitResult = LeaveDebitPlan | LeaveDebitFailure;

function isPositiveFinite(n: number): boolean {
	return Number.isFinite(n) && n > 0;
}

/**
 * Plan the conversion of approved attendance-credit minutes into an annual-leave debit.
 *
 * Rules:
 * - Working day: divisor = that day's scheduled required minutes; off-day override is ignored.
 * - Weekly off day: use explicit company override if supplied; otherwise employee normal workday.
 * - Zero scheduled off-day minutes are never used as a divisor.
 * - Invalid credit minutes or a missing/invalid selected divisor return a typed failure.
 */
export function planLeaveDebit(input: PlanLeaveDebitInput): LeaveDebitResult {
	const { creditMinutes, isOffDay, scheduledMinutes, normalMinutes } = input;
	// Treat omitted or explicitly undefined the same as null (unset override).
	const offDayOverrideMinutes = input.offDayOverrideMinutes ?? null;

	if (!isPositiveFinite(creditMinutes)) {
		return { kind: 'error', code: 'invalid_credit_minutes' };
	}

	if (isOffDay) {
		if (offDayOverrideMinutes !== null) {
			if (!isPositiveFinite(offDayOverrideMinutes)) {
				return { kind: 'error', code: 'invalid_divisor' };
			}
			return {
				kind: 'ok',
				creditMinutes,
				divisorMinutes: offDayOverrideMinutes,
				dayFraction: creditMinutes / offDayOverrideMinutes,
				divisorSource: 'off_day_override',
				inputs: {
					isOffDay,
					scheduledMinutes,
					normalMinutes,
					offDayOverrideMinutes
				}
			};
		}

		if (normalMinutes === null || !isPositiveFinite(normalMinutes)) {
			return { kind: 'error', code: 'missing_divisor' };
		}
		return {
			kind: 'ok',
			creditMinutes,
			divisorMinutes: normalMinutes,
			dayFraction: creditMinutes / normalMinutes,
			divisorSource: 'normal_workday',
			inputs: {
				isOffDay,
				scheduledMinutes,
				normalMinutes,
				offDayOverrideMinutes
			}
		};
	}

	// Working day: scheduled minutes are the divisor, override does not apply.
	if (!isPositiveFinite(scheduledMinutes)) {
		return { kind: 'error', code: 'invalid_divisor' };
	}
	return {
		kind: 'ok',
		creditMinutes,
		divisorMinutes: scheduledMinutes,
		dayFraction: creditMinutes / scheduledMinutes,
		divisorSource: 'scheduled',
		inputs: {
			isOffDay,
			scheduledMinutes,
			normalMinutes,
			offDayOverrideMinutes
		}
	};
}
