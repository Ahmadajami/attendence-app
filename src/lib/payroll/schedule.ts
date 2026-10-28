// Schedule arithmetic: shift spans and pattern slots. A 1:1 port of
// `docs/reference/schedule_spec/schedule.py`. Pure: no DB, no SvelteKit, no date library.
//
// Times are whole minutes of the day in [0, 1440). A shift whose end is at or before its start ends
// the NEXT day, so 16:00 → 04:00 is 720 minutes. There is no manual "night" flag: overnight is a
// property of the times. Pattern slots: index 0 is the anchor date, and floor modulo gives the
// right slot for days before the anchor.

export const MINUTES_PER_DAY = 24 * 60;

export const WEEKLY_SLOTS = 7;
export const MAX_CYCLE_SLOTS = 28;

/** The default night window, 22:00 → 06:00, until `night_rule` exists (plan P6). */
export const DEFAULT_NIGHT_WINDOW = { start: 22 * 60, end: 6 * 60 } as const;

const DAY_MS = 86_400_000;

function ofDay(minutes: number): number {
	return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Float hours (as Odoo stores them) → whole minutes of the day, rounded, never 24:00. */
export function toMinutes(hours: number): number {
	return ofDay(Math.round((hours || 0) * 60));
}

/** `HH:mm` or `HH:mm:ss` → minutes of the day. */
export function parseClock(time: string): number {
	const [h, m] = time.split(':');
	return ofDay(Number(h) * 60 + Number(m));
}

/** Minutes of the day → `HH:mm`. */
export function formatClock(minutes: number): string {
	const m = ofDay(minutes);
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** True when the shift ends the next day (end at or before start). */
export function crossesMidnight(start: number, end: number): boolean {
	return ofDay(end) <= ofDay(start);
}

/** Length of the shift in minutes, overnight-safe: 16→4 = 720, 0→8 = 480, 8→8 = 1440. */
export function spanMinutes(start: number, end: number): number {
	const s = ofDay(start);
	let e = ofDay(end);
	if (e <= s) e += MINUTES_PER_DAY;
	return e - s;
}

/** Default required time: the span minus the planned break, never below 0. */
export function requiredMinutes(span: number, breakMinutes: number): number {
	return Math.max(0, span - Math.max(0, breakMinutes || 0));
}

/** A daily window as intervals on a two-day minute axis, also starting the day before. */
function windowIntervals(start: number, end: number): [number, number][] {
	const s = ofDay(start);
	let e = ofDay(end);
	if (e <= s) e += MINUTES_PER_DAY;
	return [-MINUTES_PER_DAY, 0, MINUTES_PER_DAY].map((shift) => [s + shift, e + shift]);
}

/** Minutes of the shift that fall inside a daily window (e.g. 22 → 6). */
export function overlapMinutes(
	start: number,
	end: number,
	windowStart: number,
	windowEnd: number
): number {
	const shiftStart = ofDay(start);
	const shiftEnd = shiftStart + spanMinutes(start, end);
	return windowIntervals(windowStart, windowEnd).reduce(
		(sum, [ws, we]) => sum + Math.max(0, Math.min(shiftEnd, we) - Math.max(shiftStart, ws)),
		0
	);
}

/** A night shift crosses midnight, or at least half of it is inside the night window. */
export function isNight(
	start: number,
	end: number,
	windowStart: number = DEFAULT_NIGHT_WINDOW.start,
	windowEnd: number = DEFAULT_NIGHT_WINDOW.end
): boolean {
	if (crossesMidnight(start, end)) return true;
	return 2 * overlapMinutes(start, end, windowStart, windowEnd) >= spanMinutes(start, end);
}

function utcDay(date: string): number {
	return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

/** Weekday of a `YYYY-MM-DD` date as a weekly-pattern slot: Sunday 0 … Saturday 6. */
export function sundayIndex(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Which slot of a pattern applies on `date` (`YYYY-MM-DD`).
 * - weekly: the weekday (Sunday = 0), whatever the anchor;
 * - cycle: days since the anchor, modulo the number of slots, also before the anchor
 *   (anchor − 1 is the last slot).
 */
export function slotIndex(
	type: 'weekly' | 'cycle',
	slots: number,
	date: string,
	anchor: string | null = null
): number {
	if (type === 'weekly') return sundayIndex(date);
	if (anchor === null) throw new Error('A cycle pattern needs an anchor date.');
	const n = Math.max(1, slots);
	return (((utcDay(date) - utcDay(anchor)) % n) + n) % n;
}
