<script lang="ts">
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addDays } from '#lib/roster/cycle.js';
	import { formatCalendarDate } from './labels.js';

	type Props = { from: string; days: number; today: string };

	let { from, days, today }: Props = $props();
</script>

<!-- A GET form: the preview window is in the URL (`?from=`), so it survives a reload. -->
<form method="GET" class="flex flex-wrap items-center gap-2" data-sveltekit-noscroll>
	<Button
		type="submit"
		name="from"
		value={addDays(from, -days)}
		variant="outline"
		size="icon"
		aria-label={m.roster_preview_previous()}
	>
		<CaretLeftIcon class="rtl:rotate-180" />
	</Button>
	<span class="text-sm">
		<bdi>{formatCalendarDate(from)}</bdi> – <bdi>{formatCalendarDate(addDays(from, days - 1))}</bdi>
	</span>
	<Button
		type="submit"
		name="from"
		value={addDays(from, days)}
		variant="outline"
		size="icon"
		aria-label={m.roster_preview_next()}
	>
		<CaretRightIcon class="rtl:rotate-180" />
	</Button>
	{#if from !== today}
		<Button type="submit" name="from" value={today} variant="ghost" size="sm">
			{m.roster_preview_today()}
		</Button>
	{/if}
</form>
