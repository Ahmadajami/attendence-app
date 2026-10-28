import { m } from '#lib/paraglide/messages.js';
import { splitDuration } from './hint.js';

/** 720 → `12 h`, 450 → `7 h 30 min`. */
export function formatDuration(totalMinutes: number): string {
	const { hours, minutes } = splitDuration(totalMinutes);
	return minutes === 0
		? m.shifts_duration_hours({ hours })
		: m.shifts_duration_hours_minutes({ hours, minutes });
}
