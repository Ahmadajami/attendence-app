// Calendar and timezone helpers of the weekly hours engine (plan 2026-11-16, §3). Pure: plain
// `Date` and `Intl` only, so the engine runs without a package.

const DAY_MS = 86_400_000;

function utcOf(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

function dateOfUtc(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/** `date` plus `days` calendar days, as `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
	return dateOfUtc(utcOf(date) + days * DAY_MS);
}

/** Calendar days from `from` to `to` (`to` − `from`; negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
	return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

/** The weekday of `date`: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
	return new Date(utcOf(date)).getUTCDay();
}

/** Every date from `from` to `to`, both included. */
export function datesFrom(from: string, to: string): string[] {
	const out: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
	return out;
}

/** The first date of the week holding `date`, for weeks starting on `weekStart` (0 = Sunday). */
export function weekStartOf(date: string, weekStart: number): string {
	return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

const formats = new Map<string, Intl.DateTimeFormat>();

function formatOf(timeZone: string): Intl.DateTimeFormat {
	let f = formats.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		formats.set(timeZone, f);
	}
	return f;
}

/** How far `timeZone`'s wall clock is ahead of UTC at `instant`, in ms. */
function offsetAt(instant: number, timeZone: string): number {
	const parts: Record<string, number> = {};
	for (const p of formatOf(timeZone).formatToParts(new Date(instant)))
		if (p.type !== 'literal') parts[p.type] = Number(p.value);
	const wall = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second
	);
	return wall - Math.floor(instant / 1000) * 1000;
}

/** The instant of the wall-clock time `HH:MM` on `date` in `timeZone`. */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
	const [h, mi] = time.split(':').map(Number);
	const wall = utcOf(date) + (h * 60 + mi) * 60_000;
	let instant = wall - offsetAt(wall, timeZone);
	// Second pass: the offset at the guessed instant (differs only around a clock change).
	instant = wall - offsetAt(instant, timeZone);
	return new Date(instant);
}
