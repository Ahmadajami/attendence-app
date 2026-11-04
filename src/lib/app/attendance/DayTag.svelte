<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { DayTag } from '#lib/attendance/day-tags.js';
	import { getDayTagPopover } from './day-tag-popover.js';
	import { dayTagClass, dayTagLabel } from './day-tag-tones.js';

	// One day tag in its tone (DT2). Inside a `DayTagPopover` it is a button that opens the tag's
	// explanation (DT5); elsewhere (the colour guide) it is a plain sample.

	type Props = Omit<HTMLButtonAttributes, 'children'> & { tag: DayTag };

	let { tag, class: className, ...restProps }: Props = $props();

	const popover = getDayTagPopover();
	const base =
		'inline-flex h-5 w-fit shrink-0 items-center whitespace-nowrap rounded-none border px-2 py-0.5 text-xs font-medium';
</script>

{#if popover}
	<button
		{...restProps}
		type="button"
		aria-haspopup="dialog"
		class={[
			base,
			'cursor-pointer transition-colors outline-none hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50',
			dayTagClass(tag.id),
			className
		]}
		onclick={(event) => popover.toggle(tag, event.currentTarget)}
	>
		<bdi>{dayTagLabel(tag)}</bdi>
	</button>
{:else}
	<span class={[base, dayTagClass(tag.id), className]}><bdi>{dayTagLabel(tag)}</bdi></span>
{/if}
