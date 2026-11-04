<script lang="ts">
	import { dayTags, type DayTagFigures } from '#lib/attendance/day-tags.js';
	import { LATE_GRACE_MINUTES } from '#lib/roster/rules.js';
	import { graceOf, type RosterShift } from '#lib/roster/shift.js';
	import DayTag from './DayTag.svelte';

	// A stored day's Status tags (DT1, DT7, DT8): the status (or the day state), Late on a finished
	// day, Holiday, Swap, Unauthorised swap, Corrected and Waiting for recompute, each in its colour.

	type Props = {
		figures: DayTagFigures;
		/** The day's shift, for its grace minutes; unknown: the default grace. */
		shift?: Pick<RosterShift, 'graceMinutes'> | null;
		/** The row waits for a recompute. */
		flagged?: boolean;
	};

	let { figures, shift = null, flagged = false }: Props = $props();

	const tags = $derived(dayTags(figures, shift ? graceOf(shift) : LATE_GRACE_MINUTES, flagged));
</script>

<span class="inline-flex flex-wrap items-center gap-1">
	{#each tags as tag (tag.id)}
		<DayTag {tag} />
	{/each}
</span>
