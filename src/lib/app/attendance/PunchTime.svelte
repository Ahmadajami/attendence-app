<script lang="ts">
	import { calendarDate, clockOf } from '#lib/attendance/entry.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PunchSource } from '#lib/schemas/enums.js';
	import { PUNCH_SOURCE_LABEL } from './day-labels.js';

	// A counted check-in or check-out with where it came from (pay plan PR24): Typed, Punch reading
	// or Odoo seed. "Corrected" is a flag of the whole day, shown once by `DayBadges`.

	type Props = {
		/** ISO instant; `null`: not punched. */
		at: string | null;
		source: PunchSource | null;
		/** The shift date, to mark a time on the next calendar day. */
		shiftDate: string;
	};

	let { at, source, shiftDate }: Props = $props();

	const instant = $derived(at ? new Date(at) : null);
</script>

{#if instant}
	<span class="inline-flex flex-wrap items-center gap-1">
		<bdi class="font-mono" dir="ltr">{clockOf(instant)}</bdi>
		{#if calendarDate(instant) !== shiftDate}
			<Badge variant="secondary">{m.attendance_next_day()}</Badge>
		{/if}
		{#if source}
			<Badge variant="outline">{PUNCH_SOURCE_LABEL[source]()}</Badge>
		{/if}
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
