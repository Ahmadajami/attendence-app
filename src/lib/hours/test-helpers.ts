import { addDays, zonedInstant } from './dates.js';
import { DEFAULT_ABSENCE_TREATMENT, type HoursRuleVersion } from './rules.js';
import type { HoursEvent } from './segments.js';

// Made-up rules and punches for the weekly hours tests (CLAUDE.md §1: no real people).

export const TZ = 'Asia/Damascus';

export const at = (date: string, time: string) => zonedInstant(date, time, TZ);

export function rule(over: Partial<HoursRuleVersion> = {}): HoursRuleVersion {
	return {
		id: 'rule-1',
		effectiveFrom: '2026-01-01',
		effectiveTo: null,
		weeklyMinutes: 40 * 60,
		offDaysPerWeek: 2,
		weekStart: 0,
		nightStart: '22:00',
		nightEnd: '06:00',
		dayOtOn: true,
		dayOtRate: 1.25,
		nightOtOn: true,
		nightOtRate: 1.5,
		offDayOtOn: true,
		offDayOtRate: 1.5,
		offDayNightOn: false,
		offDayNightRate: null,
		absenceTreatment: { ...DEFAULT_ABSENCE_TREATMENT },
		...over
	};
}

let seq = 0;

/** A check-in and check-out on `date` (`end` ≤ `start` ends the next day). */
export function work(date: string, start: string, end: string): HoursEvent[] {
	const endDate = end <= start ? addDays(date, 1) : date;
	return [
		{
			id: `e${++seq}`,
			type: 'check_in',
			occurredAt: at(date, start),
			shiftDate: date,
			correctsEventId: null,
			isVoid: false
		},
		{
			id: `e${++seq}`,
			type: 'check_out',
			occurredAt: at(endDate, end),
			shiftDate: date,
			correctsEventId: null,
			isVoid: false
		}
	];
}

/** The same hours on each date. */
export const workEach = (dates: string[], start: string, end: string) =>
	dates.flatMap((d) => work(d, start, end));
