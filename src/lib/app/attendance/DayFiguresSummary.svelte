<script lang="ts">
	import type { DayFigures } from '#lib/attendance/day-result.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import DayStatusTags from './DayStatusTags.svelte';
	import DayTagPopover from './DayTagPopover.svelte';
	import OvertimeCell from './OvertimeCell.svelte';
	import PunchTime from './PunchTime.svelte';

	// A stored day in a few lines (pay plan task 5.3), for the entry sheet and the employee page's
	// day panel: status tags, in / out with their sources, worked, late, overtime ×rate or "not
	// paid"; every tag explains itself (DT10).

	type Props = {
		figures: DayFigures;
		/** The day's shift, for the Late mark's grace (DT8). */
		shift?: Pick<RosterShift, 'graceMinutes'> | null;
	};

	let { figures, shift = null }: Props = $props();
</script>

<DayTagPopover>
	<dl class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
		<dt class="text-muted-foreground">{m.daily_col_status()}</dt>
		<dd><DayStatusTags {figures} {shift} /></dd>
		<dt class="text-muted-foreground">{m.attendance_col_in()}</dt>
		<dd>
			<PunchTime
				at={figures.checkIn}
				source={figures.checkInSource}
				shiftDate={figures.shiftDate}
			/>
		</dd>
		<dt class="text-muted-foreground">{m.attendance_col_out()}</dt>
		<dd>
			<PunchTime
				at={figures.checkOut}
				source={figures.checkOutSource}
				shiftDate={figures.shiftDate}
			/>
		</dd>
		<dt class="text-muted-foreground">{m.daily_col_worked()}</dt>
		<dd>
			<bdi class="font-mono" dir="ltr">
				{figures.workedMinutes === null ? '—' : formatHoursMinutes(figures.workedMinutes)}
			</bdi>
		</dd>
		{#if figures.shortageMinutes > 0}
			<dt class="text-muted-foreground">{m.daily_col_shortage()}</dt>
			<dd><bdi class="font-mono" dir="ltr">{formatHoursMinutes(figures.shortageMinutes)}</bdi></dd>
		{/if}
		{#if figures.lateMinutes > 0}
			<dt class="text-muted-foreground">{m.daily_col_late()}</dt>
			<dd><bdi class="font-mono" dir="ltr">{formatHoursMinutes(figures.lateMinutes)}</bdi></dd>
		{/if}
		<dt class="text-muted-foreground">{m.daily_col_overtime()}</dt>
		<dd><OvertimeCell {figures} /></dd>
	</dl>
</DayTagPopover>
