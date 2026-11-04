<script lang="ts">
	import { calendarDate, clockOf } from '#lib/attendance/entry.js';
	import { PUNCH_SOURCE_TAG } from '#lib/attendance/day-tags.js';
	import type { PunchSource } from '#lib/schemas/enums.js';
	import DayTag from './DayTag.svelte';

	// A counted check-in or check-out with where it came from (pay plan PR24): Typed, Punch reading
	// or Odoo seed, and Next day for an overnight time, as neutral tags (DT11). "Corrected" is a flag
	// of the whole day, shown once by `DayStatusTags`.

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
			<DayTag tag={{ id: 'source.next_day' }} />
		{/if}
		{#if source}
			<DayTag tag={{ id: PUNCH_SOURCE_TAG[source] }} />
		{/if}
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
