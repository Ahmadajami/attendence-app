<script lang="ts">
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
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
			<Card.Title>{m.settings_shifts_title()}</Card.Title>
			<Card.Description>{m.settings_shifts_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button href={localizedHref('/shifts')} variant="outline">
				{m.settings_shifts_link()}
				<ArrowRightIcon data-icon="inline-end" class="rtl:rotate-180" />
			</Button>
		</Card.Content>
	</Card.Root>
</section>
