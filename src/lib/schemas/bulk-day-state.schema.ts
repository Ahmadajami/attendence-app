import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { DAILY_PAGE_SIZE } from './day-results.schema.js';
import { DAY_STATES, dayStateReason } from './day-state.schema.js';
import type { AbsenceType } from './enums.js';
import { dayKey } from '#lib/attendance/recompute.js';

export const BULK_DAY_STATES = [...DAY_STATES, 'clear'] as const;

const targetSchema = z.object({
	staffId: z.uuid({ error: () => m.daily_bulk_invalid_selection() }).toLowerCase(),
	shiftDate: z.iso.date({ error: () => m.roster_date_invalid() })
});
export type BulkDayTarget = z.infer<typeof targetSchema>;

export const bulkDayStateSchema = z.object({
	targets: z
		.array(targetSchema)
		.min(1, { error: () => m.daily_bulk_invalid_selection() })
		.max(DAILY_PAGE_SIZE, { error: () => m.daily_bulk_invalid_selection() })
		.refine(
			(targets) =>
				new Set(targets.map(({ staffId, shiftDate }) => dayKey(staffId, shiftDate))).size ===
				targets.length,
			{ error: () => m.daily_bulk_invalid_selection() }
		),
	operation: z
		.enum(BULK_DAY_STATES, { error: () => m.day_state_pick_state() })
		.default('' as 'leave')
		.refine((value) => BULK_DAY_STATES.includes(value), { error: () => m.day_state_pick_state() }),
	reason: dayStateReason,
	version: z
		.union([z.literal(''), z.string().regex(/^[a-f0-9]{64}$/)], {
			error: () => m.daily_bulk_stale()
		})
		.default('')
});
export type BulkDayStateSchema = typeof bulkDayStateSchema;
export type BulkDayStateInput = z.infer<BulkDayStateSchema>;

export type BulkDayReviewRow = BulkDayTarget & {
	person: { fullName: string; fullNameAr: string | null };
	current: AbsenceType | null;
	proposed: AbsenceType | null;
	hasPunches: boolean;
	outcome: 'change' | 'unchanged' | 'pattern' | 'owned' | 'unavailable';
};

export type BulkDayReview = {
	rows: BulkDayReviewRow[];
	changes: number;
	unchanged: number;
	blocked: number;
	version: string;
};
