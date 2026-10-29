<script lang="ts">
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import PatternBuilder from '#lib/app/patterns/PatternBuilder.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.patterns_new()} · {m.patterns_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-2">
		<Button href={localizedHref('/patterns')} variant="ghost" size="sm" class="self-start">
			<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
			{m.patterns_back()}
		</Button>
		<h2 class="text-2xl font-semibold tracking-tight">{m.patterns_new()}</h2>
	</div>

	<PatternBuilder
		form={data.form}
		shifts={data.shifts}
		targets={data.targets}
		departments={data.departments}
		today={data.today}
		canManage={data.canManage}
		pattern={null}
		returnTarget={data.returnTarget}
		editForm={null}
		shiftForm={data.shiftForm}
	/>
</section>
