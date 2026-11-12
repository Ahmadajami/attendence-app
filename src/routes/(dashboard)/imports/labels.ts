import { pairIssueMessage } from '#lib/attendance/labels.js';
import type { PairIssue } from '#lib/attendance/entry.js';
import { m } from '#lib/paraglide/messages.js';

export function kindLabel(kind: string): string {
	if (kind === 'staff') return m.imports_kind_staff();
	if (kind === 'punches') return m.imports_kind_punches();
	return kind;
}

export function statusLabel(status: string): string {
	if (status === 'committed') return m.imports_status_committed();
	if (status === 'failed') return m.imports_status_failed();
	if (status === 'undone') return m.imports_status_undone();
	return m.imports_status_previewed();
}

const REASON: Record<string, () => string> = {
	unknown_person: m.imports_punch_reason_unknown_person,
	inactive_person: m.imports_punch_reason_inactive_person,
	out_of_range: m.imports_punch_reason_out_of_range,
	no_roster_day: m.imports_punch_reason_no_roster_day,
	check_out_only: m.imports_punch_reason_check_out_only,
	span_too_long: m.imports_punch_reason_span_too_long,
	overlap: m.imports_punch_reason_overlap,
	future: m.imports_punch_reason_future,
	already_absent: m.imports_punch_reason_already_absent,
	state_conflict: m.imports_punch_reason_state_conflict,
	no_employee: m.imports_punch_reason_no_employee,
	bad_date: m.imports_punch_reason_bad_date,
	bad_time: m.imports_punch_reason_bad_time,
	bad_state: m.imports_punch_reason_bad_state,
	state_with_times: m.imports_punch_reason_state_with_times,
	already_imported: m.imports_punch_reason_already_imported,
	duplicate: m.imports_punch_reason_duplicate
};

/** A punch line's skip or refusal reason. */
export function punchReasonLabel(code: string): string {
	return (REASON[code] ?? (() => code))();
}

/** A punch line's warning: a pair issue of the entry sheet, or a full-day state on a punched day. */
export function punchWarningLabel(code: string): string {
	if (code === 'state_with_punches') return m.imports_punch_warning_state_with_punches();
	return pairIssueMessage(code as PairIssue);
}
