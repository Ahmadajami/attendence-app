<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import ShiftStartsForm from './ShiftStartsForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.settings_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.settings_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.settings_description()}</p>
	</div>

	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Title>{m.settings_shift_starts_title()}</Card.Title>
			<Card.Description>{m.settings_shift_starts_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if !data.saved}
				<p class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{m.settings_shift_starts_unsaved()}
				</p>
			{/if}
			<ShiftStartsForm data={data.form} />
		</Card.Content>
	</Card.Root>
</section>
