<script lang="ts">
	import type { DayFigures } from '#lib/attendance/day-result.js';
	import { overtimeTags } from '#lib/attendance/day-tags.js';
	import DayTag from './DayTag.svelte';

	// A day's overtime (pay plan PR20): the paid minutes at their rate, and / or "not paid", as tags
	// whose popover gives the reason (overtime off, holiday not eligible, a full-day state…).

	type Props = {
		figures: Pick<DayFigures, 'paidOtMinutes' | 'otRate' | 'unpaidExtraMinutes' | 'unpaidReason'>;
	};

	let { figures }: Props = $props();

	const tags = $derived(overtimeTags(figures));
</script>

{#if tags.length > 0}
	<span class="inline-flex flex-wrap items-center gap-1">
		{#each tags as tag (tag.id)}
			<DayTag {tag} />
		{/each}
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
