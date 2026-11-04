<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DayTag as DayTagValue } from '#lib/attendance/day-tags.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { setDayTagPopover } from './day-tag-popover.js';
	import {
		dayTagAction,
		dayTagClass,
		dayTagHelp,
		dayTagLabel,
		dayTagName,
		unpaidReasonText
	} from './day-tag-tones.js';

	// One explanation popover for every day tag inside it (DT5, DT6): the tag's name in its colour,
	// what it means and how it counts, the reason (not paid) and what to do where there is one; a
	// Swap tag links to its swap (swaps plan SW9).

	let { children }: { children: Snippet } = $props();

	let open = $state(false);
	let anchor = $state<HTMLElement | null>(null);
	let tag = $state<DayTagValue | null>(null);

	setDayTagPopover({
		toggle(next, element) {
			if (open && anchor === element) {
				open = false;
				return;
			}
			tag = next;
			anchor = element;
			open = true;
		}
	});

	const reason = $derived(tag ? unpaidReasonText(tag) : null);
	const action = $derived(tag ? dayTagAction(tag.id) : null);
</script>

{@render children()}

<Popover.Root bind:open>
	<Popover.Content
		customAnchor={anchor}
		align="start"
		class="w-72"
		onInteractOutside={(event) => {
			// A click on the open tag itself toggles it closed (`toggle`), not here.
			if (anchor && event.target instanceof Node && anchor.contains(event.target)) {
				event.preventDefault();
			}
		}}
		onCloseAutoFocus={(event) => {
			// Back to the tag that opened it, so the keyboard goes on from there.
			event.preventDefault();
			anchor?.focus();
		}}
	>
		{#if tag}
			<Popover.Header>
				<span
					class={[
						'inline-flex h-5 w-fit items-center rounded-none border px-2 text-xs font-medium',
						dayTagClass(tag.id)
					]}
				>
					<bdi>{dayTagLabel(tag)}</bdi>
				</span>
				<Popover.Title>{dayTagName(tag.id)}</Popover.Title>
				<Popover.Description>{dayTagHelp(tag.id)}</Popover.Description>
			</Popover.Header>
			{#if reason}
				<p>
					<span class="font-medium">{m.day_tag_reason()}:</span>
					{reason}
				</p>
			{/if}
			{#if action}
				<div class="flex flex-col gap-1">
					<p class="font-medium">{m.day_tag_what_to_do()}</p>
					<p class="text-muted-foreground">{action}</p>
				</div>
			{/if}
			{#if tag.swapId}
				<!-- The swap behind the day (swaps plan SW9). -->
				<Button
					variant="outline"
					size="sm"
					class="self-start"
					href={`${localizedHref('/changes')}?swap=${tag.swapId}`}
				>
					{m.swap_open()}
				</Button>
			{/if}
		{/if}
	</Popover.Content>
</Popover.Root>
