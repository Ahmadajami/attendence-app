import { localizedHref } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';
import type { DayHistoryLine } from '#lib/server/services/daily/daily.bl.js';

/**
 * A person's edit log of one shift date (pay plan PR24), newest first. Throws an `Error` with the
 * server's message when it refuses, or a "failed (error N)" one when the body has none.
 */
export async function fetchDayHistory(staffId: string, date: string): Promise<DayHistoryLine[]> {
	const params = new URLSearchParams({ staffId, date });
	const response = await fetch(`${localizedHref('/attendance/days/history')}?${params}`, {
		headers: { accept: 'application/json' }
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string } | null;
		throw new Error(body?.message || m.day_history_failed({ status: response.status }));
	}
	return (await response.json()) as DayHistoryLine[];
}

/** Where a log line's cause can be looked at, if anywhere (the swap page comes with Phase 6). */
export function causeHref(line: DayHistoryLine, staffId: string, date: string): string | null {
	const day = `${localizedHref('/employees/[id]', { id: staffId })}?tab=schedule&from=${date}&day=${date}`;
	switch (line.causeType) {
		case 'event':
		case 'absence':
		case 'assignment':
		case 'schedule':
		case 'override':
			return day;
		case 'holiday':
			if (line.causePatternId === undefined) return null;
			return line.causePatternId === null
				? localizedHref('/admin/settings')
				: `${localizedHref('/patterns/[id]', { id: line.causePatternId })}?tab=dates`;
		case 'pay_rule':
			if (line.causePatternId === undefined) return null;
			return line.causePatternId === null
				? localizedHref('/admin/settings')
				: `${localizedHref('/patterns/[id]', { id: line.causePatternId })}?tab=pay`;
		default:
			return null;
	}
}
