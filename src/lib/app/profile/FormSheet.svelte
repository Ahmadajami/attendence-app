<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { endSide } from '#lib/utils/locale.js';

	type Props = {
		title: string;
		description?: string;
		open: boolean;
		/** The form. It mounts each time the sheet opens, so it starts from the latest data. */
		children: Snippet;
	};

	let { title, description, open = $bindable(), children }: Props = $props();
</script>

<!-- The sheet around one profile form (redesign plan V4: tabs show, sheets edit). -->
<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>{title}</Sheet.Title>
			{#if description}
				<Sheet.Description>{description}</Sheet.Description>
			{/if}
		</Sheet.Header>
		<div class="px-4 pb-4">
			{@render children()}
		</div>
	</Sheet.Content>
</Sheet.Root>
