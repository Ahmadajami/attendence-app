// Shared test fixture (imported by `*.test.ts` only): the seeded D and N shifts, and one shift that
// isn't 12 h. Ids are the codes, so slots read like the roster.
import type { RosterShift } from './shift.js';

function testShift(
	code: string,
	startTime: string,
	endTime: string,
	extra: Partial<RosterShift> = {}
): RosterShift {
	return {
		id: code,
		code,
		nameEn: code,
		nameAr: code,
		colour: '#475569',
		startTime,
		endTime,
		breakMinutes: 0,
		requiredMinutes: null,
		windowBeforeMinutes: 180,
		windowAfterMinutes: 360,
		graceMinutes: 0,
		active: true,
		...extra
	};
}

/** Day 07:00 → 19:00. */
export const D = testShift('D', '07:00:00', '19:00:00');
/** Night 19:00 → 07:00 the next day. */
export const N = testShift('N', '19:00:00', '07:00:00');
/** Evening 16:00 → 04:00 the next day, 30 min break: 720 span, 690 required. */
export const E = testShift('E', '16:00:00', '04:00:00', { breakMinutes: 30 });

export const SHIFTS: ReadonlyMap<string, RosterShift> = new Map([D, N, E].map((s) => [s.id, s]));

/** `'D N O O'` → `['D', 'N', null, null]`: shift codes are the fixture ids, `O` is off. */
export function slots(codes: string): (string | null)[] {
	return codes.split(' ').map((c) => (c === 'O' ? null : c));
}

/** A slot's letter for comparing runs of days: the code, or `O` for off. */
export function letter(shiftId: string | null): string {
	return shiftId ?? 'O';
}
