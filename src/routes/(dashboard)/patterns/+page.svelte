<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import CalendarDotsIcon from 'phosphor-svelte/lib/CalendarDotsIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import PatternCard from '#lib/app/patterns/PatternCard.svelte';
	import Empty from '#lib/app/state/Empty.svelte';
	import { shiftsById } from '#lib/app/roster/labels.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PatternListItem } from '#lib/server/services/patterns/patterns.bl.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import { lookupName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const byId = $derived(shiftsById(data.shifts));
	const ALL = 'all';
	const departmentName = $derived(data.departments.find((d) => d.id === data.department));

	// ---- Copy / (de)activate through hidden forms (the dropdown can't hold a form) ----
	let copyForm: HTMLFormElement | null = $state(null);
	let activeForm: HTMLFormElement | null = $state(null);
	let request = $state({ patternId: '', active: 'false' });

	async function copy(pattern: PatternListItem) {
		request = { ...request, patternId: pattern.id };
		await tick();
		copyForm?.requestSubmit();
	}

	async function setActive(pattern: PatternListItem, active: boolean) {
		request = { patternId: pattern.id, active: String(active) };
		await tick();
		activeForm?.requestSubmit();
	}

	/** The department filter is navigation: it submits its GET form on change. */
	let filterForm: HTMLFormElement | null = $state(null);
</script>

<svelte:head>
	<title>{m.patterns_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.patterns_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.patterns_description()}</p>
		</div>
		{#if data.canManage}
			<Button href={localizedHref('/patterns/new')}>
				<PlusIcon data-icon="inline-start" />
				{m.patterns_new()}
			</Button>
		{/if}
	</div>

	<form method="GET" bind:this={filterForm} class="flex flex-wrap items-center gap-2">
		<Select.Root
			type="single"
			name="department"
			value={data.department ?? ALL}
			onValueChange={async () => {
				// Let the hidden input take the new value first; `all` means no filter.
				await tick();
				filterForm?.requestSubmit();
			}}
		>
			<Select.Trigger class="w-64" aria-label={m.assign_filter_department()}>
				{departmentName ? lookupName(departmentName) : m.assign_all_departments()}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value={ALL} label={m.assign_all_departments()} />
				{#each data.departments as department (department.id)}
					<Select.Item value={department.id} label={lookupName(department)} />
				{/each}
			</Select.Content>
		</Select.Root>
	</form>

	{#if data.patterns.length > 0}
		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each data.patterns as pattern (pattern.id)}
				<PatternCard
					{pattern}
					shifts={byId}
					canManage={data.canManage}
					onCopy={copy}
					onSetActive={setActive}
				/>
			{/each}
		</div>
	{:else}
		<Empty
			icon={CalendarDotsIcon}
			title={data.total === 0 ? m.patterns_empty() : m.patterns_empty_filtered()}
			description={data.total === 0 ? m.patterns_empty_description() : undefined}
		>
			{#if data.canManage && data.total === 0}
				<Button href={localizedHref('/patterns/new')}>
					<PlusIcon data-icon="inline-start" />
					{m.patterns_new()}
				</Button>
			{/if}
		</Empty>
	{/if}
</section>

<form bind:this={copyForm} method="POST" action="?/copy" use:enhance={toastNotice} hidden>
	<input type="hidden" name="patternId" value={request.patternId} />
</form>
<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
	<input type="hidden" name="patternId" value={request.patternId} />
	<input type="hidden" name="active" value={request.active} />
</form>
