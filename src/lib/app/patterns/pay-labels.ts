import { m } from '#lib/paraglide/messages.js';
import { formatCalendarDate } from '../roster/labels.js';

// Labels of the pattern's "Overtime & pay" and "Holidays & missions" tabs (pay plan PR12).

/** `from` – `to` (inclusive) in the current locale; one date when they are the same day. */
export function formatDateRange(from: string, to: string): string {
	return from === to
		? formatCalendarDate(from)
		: `${formatCalendarDate(from)} – ${formatCalendarDate(to)}`;
}

/** A rate multiplier as shown beside a value: `×1.25`. */
export const formatRate = (rate: number) => `×${rate.toFixed(2)}`;

export type SpanState = 'past' | 'current' | 'upcoming';

/** Where a pay-rule version stands on `today` (`effectiveTo` exclusive). */
export function versionState(
	v: { effectiveFrom: string; effectiveTo: string | null },
	today: string
): SpanState {
	if (v.effectiveTo !== null && v.effectiveTo <= today) return 'past';
	return v.effectiveFrom > today ? 'upcoming' : 'current';
}

export const VERSION_STATE_LABEL: Record<SpanState, () => string> = {
	past: m.pattern_pay_state_past,
	current: m.pattern_pay_state_current,
	upcoming: m.pattern_pay_state_upcoming
};

export type HolidayState = 'cancelled' | 'past' | 'ongoing' | 'upcoming';

/** Where a holiday (inclusive dates) stands on `today`. */
export function holidayState(
	h: { startsOn: string; endsOn: string; cancelledAt: Date | string | null },
	today: string
): HolidayState {
	if (h.cancelledAt !== null) return 'cancelled';
	if (h.endsOn < today) return 'past';
	return h.startsOn > today ? 'upcoming' : 'ongoing';
}

export const HOLIDAY_STATE_LABEL: Record<HolidayState, () => string> = {
	cancelled: m.pattern_holiday_state_cancelled,
	past: m.pattern_holiday_state_past,
	ongoing: m.pattern_holiday_state_ongoing,
	upcoming: m.pattern_holiday_state_upcoming
};
