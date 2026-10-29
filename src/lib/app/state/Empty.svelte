<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		/** A phosphor icon component. */
		icon?: Component<{ class?: string }>;
		title: string;
		description?: string;
		/** An action, e.g. a "New …" button. */
		children?: Snippet;
	};

	let {
		icon: Icon,
		title,
		description,
		children,
		class: className,
		...restProps
	}: Props = $props();
</script>

<!-- Nothing to list yet: one shared look for empty lists (CLAUDE.md §3, state components). -->
<div
	class={cn('flex flex-col items-center justify-center gap-2 p-8 text-center', className)}
	{...restProps}
>
	{#if Icon}
		<Icon class="size-10 text-muted-foreground" />
	{/if}
	<p class="font-medium">{title}</p>
	{#if description}
		<p class="max-w-prose text-sm text-muted-foreground">{description}</p>
	{/if}
	{@render children?.()}
</div>
