import { getRequestEvent, query } from '$app/server';
import { z } from 'zod';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { getDayPunches } from '#lib/server/services/attendance/attendance.bl.js';

// The day editor's check-in / out (PR46): the day's punches, loaded when the sheet opens on it,
// so the form starts from what is recorded now. Needs `attendance.record`, like saving.

export const findDayPunches = query(
	z.object({ staffId: z.uuid(), date: z.iso.date() }),
	async ({ staffId, date }) => {
		const { locals } = getRequestEvent();
		const user = requirePermission(locals, 'attendance.record');
		return getDayPunches({ user, permissions: locals.permissions }, staffId, date);
	}
);
