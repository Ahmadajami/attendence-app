import { m } from '#lib/paraglide/messages.js';
import type { EntryAbsence } from '#lib/schemas/attendance.schema.js';
import type { PairIssue } from './entry.js';

/** One sentence per check, the same in the entry sheet and in the service's refusals. */
export function pairIssueMessage(issue: PairIssue | 'reason_required'): string {
	switch (issue) {
		case 'span_too_long':
			return m.attendance_issue_span_too_long();
		case 'overlap':
			return m.attendance_issue_overlap();
		case 'future':
			return m.attendance_issue_future();
		case 'outside_window':
			return m.attendance_issue_outside_window();
		case 'unplanned':
			return m.attendance_issue_unplanned();
		case 'reason_required':
			return m.attendance_issue_reason_required();
	}
}

export function absenceLabel(type: EntryAbsence): string {
	if (type === 'no_show') return m.attendance_absence_no_show();
	if (type === 'leave') return m.attendance_absence_leave();
	return m.attendance_absence_sick();
}
