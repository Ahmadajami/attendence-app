<script lang="ts">
	import PaletteIcon from 'phosphor-svelte/lib/PaletteIcon';
	import { DAY_TAG_GROUPS } from '#lib/attendance/day-tags.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { endSide } from '#lib/utils/locale.js';
	import DayTag from './DayTag.svelte';
	import { dayTagHelp, GROUP_LABEL } from './day-tag-tones.js';

	// The colour guide (DT9): every day tag by group, with its colour and meaning. Built from the
	// tag catalogue, so it lists exactly what the tables can show.

	let open = $state(false);
</script>

<Button variant="outline" size="sm" onclick={() => (open = true)}>
	<PaletteIcon data-icon="inline-start" />
	{m.day_tag_guide()}
</Button>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="w-full overflow-y-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>{m.day_tag_guide()}</Sheet.Title>
			<Sheet.Description>{m.day_tag_guide_description()}</Sheet.Description>
		</Sheet.Header>
		<div class="flex flex-col gap-6 px-4 pb-6">
			{#each DAY_TAG_GROUPS as { group, tags } (group)}
				<section class="flex flex-col gap-3">
					<h3 class="text-sm font-medium">{GROUP_LABEL[group]()}</h3>
					<dl class="flex flex-col gap-3">
						{#each tags as id (id)}
							<div class="grid grid-cols-[8rem_1fr] items-start gap-3">
								<dt><DayTag tag={{ id }} /></dt>
								<dd class="text-xs text-muted-foreground">{dayTagHelp(id)}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
	</Sheet.Content>
</Sheet.Root>
