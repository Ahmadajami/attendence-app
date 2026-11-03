<script lang="ts">
	import type { DayFigures } from '#lib/attendance/day-result.js';
	import { absenceLabel } from '#lib/attendance/labels.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { SWAP_ROLE_LABEL } from './day-labels.js';

	// What makes a stored day special (pay plan §5, PR24): Holiday, its state (Leave, Mission…),
	// Swap on / off, Unauthorised swap, and Corrected when a counted time was corrected.

	type Props = {
		figures: Pick<
			DayFigures,
			'holidayId' | 'absenceType' | 'swapRole' | 'unauthSwap' | 'corrected'
		>;
	};

	let { figures }: Props = $props();
</script>

{#if figures.holidayId || figures.absenceType || figures.swapRole || figures.unauthSwap || figures.corrected}
	<span class="inline-flex flex-wrap items-center gap-1">
		{#if figures.holidayId}
			<Badge variant="secondary">{m.roster_preview_holiday()}</Badge>
		{/if}
		{#if figures.absenceType}
			<Badge variant="outline">{absenceLabel(figures.absenceType)}</Badge>
		{/if}
		{#if figures.swapRole}
			<Badge variant="secondary">{SWAP_ROLE_LABEL[figures.swapRole]()}</Badge>
		{/if}
		{#if figures.corrected}
			<Badge variant="outline">{m.daily_source_corrected()}</Badge>
		{/if}
		{#if figures.unauthSwap}
			<Badge variant="destructive">{m.daily_badge_unauth_swap()}</Badge>
		{/if}
	</span>
{/if}
