import { absenceLabel } from '#lib/attendance/labels.js';
import {
	DAY_TAG_TONE,
	type DayTag,
	type DayTagGroup,
	type DayTagId,
	type DayTagTone
} from '#lib/attendance/day-tags.js';
import { m } from '#lib/paraglide/messages.js';
import { formatHoursMinutes } from '#lib/roster/overtime.js';
import { formatRate } from '../patterns/pay-labels.js';
import { DAY_STATUS_LABEL, SWAP_ROLE_LABEL, UNPAID_REASON_LABEL } from './day-labels.js';

// How a day tag looks and reads (plans/2026-11-03-day-tags-colour-guide.md §2, §3): the tone's
// classes, the tag's name, its label with figures, and the popover's texts.

// Literal class names (Tailwind scans for them). Tinted, never solid (DT2).
const TONE_CLASS: Record<DayTagTone, string> = {
	ok: 'border-success/30 bg-success/10 text-success',
	attention: 'border-warning/30 bg-warning/10 text-warning',
	problem: 'border-problem/30 bg-problem/10 text-problem',
	leave: 'border-state-leave/30 bg-state-leave/10 text-state-leave',
	sick: 'border-state-sick/30 bg-state-sick/10 text-state-sick',
	mission: 'border-state-mission/30 bg-state-mission/10 text-state-mission',
	holiday: 'border-holiday/30 bg-holiday/10 text-holiday',
	info: 'border-info/30 bg-info/10 text-info',
	neutral: 'border-border bg-transparent text-muted-foreground'
};

/** A small dot of the tone (the Status filter, DT10). */
const TONE_DOT: Record<DayTagTone, string> = {
	ok: 'bg-success',
	attention: 'bg-warning',
	problem: 'bg-problem',
	leave: 'bg-state-leave',
	sick: 'bg-state-sick',
	mission: 'bg-state-mission',
	holiday: 'bg-holiday',
	info: 'bg-info',
	neutral: 'bg-muted-foreground'
};

export const dayTagClass = (id: DayTagId): string => TONE_CLASS[DAY_TAG_TONE[id]];
export const dayTagDot = (id: DayTagId): string => TONE_DOT[DAY_TAG_TONE[id]];

/** The tag's name, without figures: the popover's title and the colour guide's entry. */
const NAME: Record<DayTagId, () => string> = {
	'status.expected': DAY_STATUS_LABEL.expected,
	'status.present': DAY_STATUS_LABEL.present,
	'status.late': DAY_STATUS_LABEL.late,
	'status.on_break': DAY_STATUS_LABEL.on_break,
	'status.done': DAY_STATUS_LABEL.done,
	'status.missing': DAY_STATUS_LABEL.missing,
	'status.off': DAY_STATUS_LABEL.off,
	'status.unscheduled': DAY_STATUS_LABEL.unscheduled,
	'state.leave': () => absenceLabel('leave'),
	'state.sick': () => absenceLabel('sick'),
	'state.no_show': () => absenceLabel('no_show'),
	'state.mission': () => absenceLabel('mission'),
	'state.other': () => absenceLabel('other'),
	'mark.holiday': m.roster_preview_holiday,
	'mark.late': m.day_tag_mark_late_name,
	'mark.swap_on': SWAP_ROLE_LABEL.swap_on,
	'mark.swap_off': SWAP_ROLE_LABEL.swap_off,
	'mark.unauth_swap': m.daily_badge_unauth_swap,
	'mark.corrected': m.daily_source_corrected,
	'mark.flagged': m.daily_badge_flagged,
	'source.typed': m.daily_source_typed,
	'source.punch_reading': m.daily_source_punch_reading,
	'source.odoo_seed': m.daily_source_odoo_seed,
	'source.next_day': m.attendance_next_day,
	'ot.paid': m.day_tag_ot_paid_name,
	'ot.unpaid': m.day_tag_ot_unpaid_name,
	'credit.friday_prayer': m.day_tag_credit_friday_prayer_name
};

const HELP: Record<DayTagId, () => string> = {
	'status.expected': m.day_tag_status_expected_help,
	'status.present': m.day_tag_status_present_help,
	'status.late': m.day_tag_status_late_help,
	'status.on_break': m.day_tag_status_on_break_help,
	'status.done': m.day_tag_status_done_help,
	'status.missing': m.day_tag_status_missing_help,
	'status.off': m.day_tag_status_off_help,
	'status.unscheduled': m.day_tag_status_unscheduled_help,
	'state.leave': m.day_tag_state_leave_help,
	'state.sick': m.day_tag_state_sick_help,
	'state.no_show': m.day_tag_state_no_show_help,
	'state.mission': m.day_tag_state_mission_help,
	'state.other': m.day_tag_state_other_help,
	'mark.holiday': m.day_tag_mark_holiday_help,
	'mark.late': m.day_tag_mark_late_help,
	'mark.swap_on': m.day_tag_mark_swap_on_help,
	'mark.swap_off': m.day_tag_mark_swap_off_help,
	'mark.unauth_swap': m.day_tag_mark_unauth_swap_help,
	'mark.corrected': m.day_tag_mark_corrected_help,
	'mark.flagged': m.day_tag_mark_flagged_help,
	'source.typed': m.day_tag_source_typed_help,
	'source.punch_reading': m.day_tag_source_punch_reading_help,
	'source.odoo_seed': m.day_tag_source_odoo_seed_help,
	'source.next_day': m.day_tag_source_next_day_help,
	'ot.paid': m.day_tag_ot_paid_help,
	'ot.unpaid': m.day_tag_ot_unpaid_help,
	'credit.friday_prayer': m.day_tag_credit_friday_prayer_help
};

/** "What to do", for the tags that ask for something (DT6). */
const ACTION: Partial<Record<DayTagId, () => string>> = {
	'status.missing': m.day_tag_status_missing_action,
	'state.mission': m.day_tag_state_mission_action,
	'mark.corrected': m.day_tag_mark_corrected_action,
	'mark.flagged': m.day_tag_mark_flagged_action
};

export const GROUP_LABEL: Record<DayTagGroup, () => string> = {
	status: m.day_tag_group_status,
	state: m.day_tag_group_state,
	mark: m.day_tag_group_mark,
	source: m.day_tag_group_source,
	overtime: m.day_tag_group_overtime,
	credit: m.day_tag_group_credit
};

export const dayTagName = (id: DayTagId): string => NAME[id]();
export const dayTagHelp = (id: DayTagId): string => HELP[id]();
export const dayTagAction = (id: DayTagId): string | null => ACTION[id]?.() ?? null;

/**
 * The text on the tag itself: its name, with its minutes and rate where it has them (without
 * minutes, as in the colour guide, the name alone).
 */
export function dayTagLabel(tag: DayTag): string {
	if (tag.minutes === undefined) return dayTagName(tag.id);
	const time = formatHoursMinutes(tag.minutes);
	switch (tag.id) {
		case 'mark.late':
			return m.day_tag_mark_late_label({ time });
		case 'ot.paid':
			return tag.rate == null ? time : `${time} ${formatRate(tag.rate)}`;
		case 'ot.unpaid':
			return m.daily_not_paid({ time });
		case 'credit.friday_prayer':
			return m.day_tag_credit_friday_prayer_label({ minutes: tag.minutes });
		default:
			return dayTagName(tag.id);
	}
}

/** Why extra time was not paid, for the `ot.unpaid` popover. */
export const unpaidReasonText = (tag: DayTag): string | null =>
	tag.id !== 'ot.unpaid'
		? null
		: tag.reason
			? UNPAID_REASON_LABEL[tag.reason]()
			: m.daily_unpaid_unknown();
