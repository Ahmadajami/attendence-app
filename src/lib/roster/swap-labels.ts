import { m } from '#lib/paraglide/messages.js';
import type { SwapKind, SwapScope, SwapState } from '#lib/schemas/enums.js';
import type { SwapIssue } from './swaps.js';

// Words for swaps (swaps plan §2): the issue codes of `checkSwap`, and the kind, scope and state
// labels. Shared by the swap service (its refusals) and the Swaps page.

const ISSUE: Record<Exclude<SwapIssue, 'scope'>, () => string> = {
	same_date: m.swap_issue_same_date,
	missing_date: m.swap_issue_missing_date,
	a_not_working: m.swap_issue_a_not_working,
	a_not_off: m.swap_issue_a_not_off,
	b_not_working: m.swap_issue_b_not_working,
	b_not_off: m.swap_issue_b_not_off,
	o_not_off: m.swap_issue_o_not_off,
	absence: m.swap_issue_absence,
	override: m.swap_issue_override,
	holiday: m.swap_issue_holiday,
	inactive: m.swap_issue_inactive
};

/** Why a swap can't apply, in words. */
export function swapIssueText(issue: SwapIssue, scope: SwapScope): string {
	if (issue === 'scope')
		return scope === 'week' ? m.swap_issue_scope_week() : m.swap_issue_scope_month();
	return ISSUE[issue]();
}

export const SWAP_KIND_LABEL: Record<SwapKind, () => string> = {
	self_swap: m.swap_kind_self,
	emp_swap: m.swap_kind_emp
};

export const SWAP_SCOPE_LABEL: Record<SwapScope, () => string> = {
	week: m.swap_scope_week,
	month: m.swap_scope_month
};

export const SWAP_STATE_LABEL: Record<SwapState, () => string> = {
	pending: m.swap_state_pending,
	approved: m.swap_state_approved,
	rejected: m.swap_state_rejected,
	cancelled: m.swap_state_cancelled
};
