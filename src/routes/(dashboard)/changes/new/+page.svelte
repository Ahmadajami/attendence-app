<script lang="ts">
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import SwapForm from '#lib/app/swaps/SwapForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const shifts = $derived(new Map(data.shifts.map((s) => [s.id, s])));
</script>

<svelte:head>
	<title>{m.swap_form_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<Button variant="ghost" size="sm" class="self-start" href={localizedHref('/changes')}>
		<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
		{m.swap_back()}
	</Button>
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.swap_form_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.swap_new_description()}</p>
	</div>

	<SwapForm
		data={data.form}
		{shifts}
		canApprove={data.canApprove}
		person={data.person}
		today={data.today}
	/>
</section>
