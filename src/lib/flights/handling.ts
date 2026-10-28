/** Provisional handling-window defaults (CLAUDE.md §10). Editable per flight. */
export const DEFAULT_HANDLING_MINUTES = {
	arrival: { before: 30, after: 60 },
	departure: { before: 90, after: 15 }
} as const;

export type FlightDirection = keyof typeof DEFAULT_HANDLING_MINUTES;

const MINUTE = 60_000;

export function defaultHandlingWindow(
	scheduledAt: Date,
	direction: FlightDirection
): HandlingWindow {
	const { before, after } = DEFAULT_HANDLING_MINUTES[direction];
	return {
		startsAt: new Date(scheduledAt.getTime() - before * MINUTE),
		endsAt: new Date(scheduledAt.getTime() + after * MINUTE)
	};
}

export type HandlingWindow = { startsAt: Date; endsAt: Date };

/**
 * Keep a flight's existing (possibly overridden) window durations when it is rescheduled:
 * shift both ends by the change in scheduled time.
 */
export function shiftHandlingWindow(
	old: { scheduledAt: Date } & HandlingWindow,
	newScheduledAt: Date
): HandlingWindow {
	const delta = newScheduledAt.getTime() - old.scheduledAt.getTime();
	return {
		startsAt: new Date(old.startsAt.getTime() + delta),
		endsAt: new Date(old.endsAt.getTime() + delta)
	};
}

/** Minute precision: `datetime-local` inputs drop seconds. */
const minuteOf = (date: Date) => Math.floor(date.getTime() / MINUTE);

function sameWindow(a: HandlingWindow, b: HandlingWindow): boolean {
	return minuteOf(a.startsAt) === minuteOf(b.startsAt) && minuteOf(a.endsAt) === minuteOf(b.endsAt);
}

/**
 * Whether a flight's window is a manual override, which needs a reason (CLAUDE.md §6.3). It isn't
 * when it equals the default for the flight's time and direction, or, for an existing flight, its
 * stored window moved along with a reschedule. Shared by the flight sheet and the flights BL.
 */
export function isHandlingOverride(
	flight: { scheduledAt: Date; direction: FlightDirection } & HandlingWindow,
	stored?: { scheduledAt: Date } & HandlingWindow
): boolean {
	if (sameWindow(flight, defaultHandlingWindow(flight.scheduledAt, flight.direction))) return false;
	return !stored || !sameWindow(flight, shiftHandlingWindow(stored, flight.scheduledAt));
}
