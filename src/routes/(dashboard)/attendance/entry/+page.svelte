<script lang="ts">
	import { tick } from 'svelte';
	import RecomputeCard from '#lib/app/attendance/RecomputeCard.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { lookupName } from '#lib/utils/locale.js';
	import EntrySheetForm from './EntrySheetForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const scopeValue = $derived(
		!data.sheet.scope
			? ''
			: 'departmentId' in data.sheet.scope
				? `department:${data.sheet.scope.departmentId}`
				: `team:${data.sheet.scope.teamId}`
	);

	const scopeLabel = (value: string) => {
		const [kind, id] = value.split(':');
		const row =
			kind === 'department'
				? data.sheet.departments.find((d) => d.id === id)
				: data.sheet.teams.find((t) => t.id === id);
		return row ? lookupName(row) : m.attendance_pick_scope();
	};

	let filter: HTMLFormElement | undefined = $state();
	/** The picked scope; follows the URL after each navigation. */
	let scope = $derived(scopeValue);

	/** Date and scope live in the URL (GET form), so the sheet survives a reload. */
	async function apply() {
		await tick();
		filter?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{m.attendance_entry_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.attendance_entry_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.attendance_entry_description()}</p>
	</div>

	<form
		bind:this={filter}
		method="GET"
		class="flex flex-wrap items-end gap-3"
		data-sveltekit-reset="false"
	>
		<div class="flex flex-col gap-2">
			<Label for="entry-date">{m.attendance_field_date()}</Label>
			<Input
				id="entry-date"
				type="date"
				name="date"
				value={data.sheet.shiftDate}
				max={data.sheet.today}
				onchange={apply}
				class="w-44"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<Label for="entry-scope">{m.attendance_field_scope()}</Label>
			<Select.Root type="single" name="scope" bind:value={scope} onValueChange={apply}>
				<Select.Trigger id="entry-scope" class="w-64">{scopeLabel(scope)}</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.Label>{m.nav_departments()}</Select.Label>
						{#each data.sheet.departments as department (department.id)}
							<Select.Item
								value={`department:${department.id}`}
								label={lookupName(department)}
								class="ps-[calc(0.5rem+var(--depth)*1rem)]"
								style={`--depth: ${department.depth}`}
							/>
						{/each}
					</Select.Group>
					<Select.Group>
						<Select.Label>{m.nav_teams()}</Select.Label>
						{#each data.sheet.teams as team (team.id)}
							<Select.Item value={`team:${team.id}`} label={lookupName(team)} />
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</div>
		<noscript><button type="submit">{m.attendance_show()}</button></noscript>
	</form>

	<Card.Root>
		<Card.Content class="px-0">
			<!-- Recreated whenever the sheet reloads (date, scope, or after a save). -->
			{#key data.form}
				<EntrySheetForm data={data.form} sheet={data.sheet} />
			{/key}
		</Card.Content>
	</Card.Root>

	{#if data.recomputeForm}
		<RecomputeCard
			data={data.recomputeForm}
			today={data.sheet.today}
			maxDays={data.maxRecomputeDays}
		/>
	{/if}
</section>
