import { weekStartOf } from './dates.js';

// The off days of each week (plan 2026-11-16, WH2, WH5, Q-WH1). Pure.

export type OffDayCandidate = {
	date: string;
	/** Off by the person's fixed weekdays (`true`/`false`); `null`: the day floats. */
	fixedOff: boolean | null;
	/** Minutes worked that date (0 on an absence day: its punches are ignored). */
	workedMinutes: number;
	hasAbsence: boolean;
};

export type OffSource = 'fixed' | 'floating';

export type Week = {
	/** First and last date of the week inside the period. */
	start: string;
	end: string;
	/** Off days the floating dates of this week get (WH5: by share in a partial week). */
	floatingOffDays: number;
	offDates: string[];
};

/** Floating off days for `floatingDays` dates of one week: round(offDaysPerWeek × n ÷ 7). */
export function floatingOffCount(offDaysPerWeek: number, floatingDays: number): number {
	return Math.min(floatingDays, Math.round((offDaysPerWeek * floatingDays) / 7));
}

/**
 * Split the period's dates into weeks starting on `weekStart`, and pick each week's off days:
 * fixed dates by the person's weekdays; floating dates get their share of the week's off days, the
 * least-worked first, then a day without an absence, then the earlier date (Q-WH1).
 * `offDaysPerWeekOn` gives the company's off days per week in force on a date (the week's first
 * date in the period is used).
 */
export function pickOffDays(
	days: readonly OffDayCandidate[],
	weekStart: number,
	offDaysPerWeekOn: (date: string) => number
): { off: Map<string, OffSource>; weeks: Week[] } {
	const off = new Map<string, OffSource>();
	const weeks: Week[] = [];
	const byWeek = new Map<string, OffDayCandidate[]>();
	for (const day of days) {
		const key = weekStartOf(day.date, weekStart);
		const list = byWeek.get(key) ?? [];
		list.push(day);
		byWeek.set(key, list);
	}
	for (const key of [...byWeek.keys()].sort()) {
		const list = (byWeek.get(key) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
		for (const day of list) if (day.fixedOff === true) off.set(day.date, 'fixed');
		const floating = list.filter((d) => d.fixedOff === null);
		const count = floatingOffCount(offDaysPerWeekOn(list[0].date), floating.length);
		const chosen = floating
			.slice()
			.sort(
				(a, b) =>
					a.workedMinutes - b.workedMinutes ||
					Number(a.hasAbsence) - Number(b.hasAbsence) ||
					(a.date < b.date ? -1 : 1)
			)
			.slice(0, count);
		for (const day of chosen) off.set(day.date, 'floating');
		weeks.push({
			start: list[0].date,
			end: list[list.length - 1].date,
			floatingOffDays: count,
			offDates: list.filter((d) => off.has(d.date)).map((d) => d.date)
		});
	}
	return { off, weeks };
}
