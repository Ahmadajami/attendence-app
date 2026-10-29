// Figures shown on pattern cards and in the builder (mockup F2: "avg h/week"). Client-safe.

import type { PatternType } from '#lib/schemas/enums.js';
import { requiredOf, type RosterShift } from './shift.js';

type HoursShift = Pick<RosterShift, 'startTime' | 'endTime' | 'breakMinutes' | 'requiredMinutes'>;

/**
 * Average required minutes per 7 days: a weekly pattern's week, or a cycle's total scaled to a
 * week. Unknown shift ids count as 0.
 */
export function averageWeeklyMinutes(
	pattern: { type: PatternType; slots: readonly (string | null)[] },
	shifts: ReadonlyMap<string, HoursShift>
): number {
	if (pattern.slots.length === 0) return 0;
	const total = pattern.slots.reduce((sum, id) => {
		const shift = id === null ? undefined : shifts.get(id);
		return sum + (shift ? requiredOf(shift) : 0);
	}, 0);
	return pattern.type === 'weekly' ? total : Math.round((total * 7) / pattern.slots.length);
}
