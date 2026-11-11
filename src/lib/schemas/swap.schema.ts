import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import type { StatusMessage } from '#lib/utils/form-toasts.js';
import { SWAP_KINDS, SWAP_SCOPES } from './enums.js';

// Swap requests (swaps plan SW2–SW6; pay plan PR25–PR29). The same rules as the `swap_request`
// DB checks, so the form says what is wrong before the database would.

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });
const optionalDate = z.union([z.literal(''), isoDate]);
const person = z.uuid({ error: () => m.attendance_error_person() });

const reason = z
	.string()
	.trim()
	.min(1, { error: () => m.roster_reason_required() })
	.max(500);

/**
 * New swap. Self swap: `firstDate` = the work day W that becomes off, `secondDate` = the off day O
 * that becomes work (required). Employee swap: `firstDate` = D (A works, B is off), `secondDate` =
 * the optional return date D2. Shift change: `firstDate` = the work day, `shiftId` = the shift A
 * works instead (required; no second date, never pay as overtime). `approve`: save and approve in
 * one step (SW3).
 */
export const swapFormSchema = z
	.object({
		kind: z.enum(SWAP_KINDS).default('self_swap'),
		staffId: person,
		otherStaffId: z.union([z.literal(''), person]).default(''),
		firstDate: isoDate,
		secondDate: optionalDate.default(''),
		shiftId: z.union([z.literal(''), z.uuid()]).default(''),
		scope: z.enum(SWAP_SCOPES).default('week'),
		payAsOt: z.boolean().default(false),
		reason,
		approve: z.boolean().default(false)
	})
	.superRefine((value, ctx) => {
		const issue = (path: string, message: string) =>
			ctx.addIssue({ code: 'custom', path: [path], message });
		if (value.kind === 'emp_swap') {
			if (!value.otherStaffId) issue('otherStaffId', m.swap_error_other_required());
			else if (value.otherStaffId === value.staffId)
				issue('otherStaffId', m.swap_error_other_same());
		}
		if (value.kind === 'self_swap' && !value.secondDate)
			issue('secondDate', m.swap_error_second_required());
		if (value.kind === 'shift_change' && !value.shiftId)
			issue('shiftId', m.swap_error_shift_required());
		if (value.secondDate && value.secondDate === value.firstDate)
			issue('secondDate', m.swap_issue_same_date());
	});
export type SwapFormSchema = typeof swapFormSchema;
export type SwapFormInput = z.infer<SwapFormSchema>;

/** Approve (optional note) or reject (note required, SW5) a pending request. */
export const swapDecisionSchema = z
	.object({
		id: z.uuid(),
		decision: z.enum(['approve', 'reject']).default('approve'),
		note: z.string().trim().max(500).default('')
	})
	.superRefine((value, ctx) => {
		if (value.decision === 'reject' && !value.note)
			ctx.addIssue({ code: 'custom', path: ['note'], message: m.swap_error_note_required() });
	});
export type SwapDecisionSchema = typeof swapDecisionSchema;
export type SwapDecisionInput = z.infer<SwapDecisionSchema>;

/** Withdraw a pending request or undo an approved one (SW5); the reason is required. */
export const swapCancelSchema = z.object({ id: z.uuid(), reason });
export type SwapCancelSchema = typeof swapCancelSchema;
export type SwapCancelInput = z.infer<SwapCancelSchema>;

/** What the New swap preview asks about (the form's fields, any of them still empty). */
export const swapPreviewSchema = z.object({
	kind: z.enum(SWAP_KINDS),
	staffId: z.union([z.literal(''), z.uuid()]),
	otherStaffId: z.union([z.literal(''), z.uuid()]),
	firstDate: optionalDate,
	secondDate: optionalDate,
	shiftId: z.union([z.literal(''), z.uuid()]).default(''),
	scope: z.enum(SWAP_SCOPES)
});
export type SwapPreviewInput = z.infer<typeof swapPreviewSchema>;

/** The status message; a saved swap also says where it is listed (the New swap page opens it). */
export type SwapMessage = StatusMessage & {
	swapId?: string;
	tab?: 'pending' | 'approved';
	month?: string;
};
