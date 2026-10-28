<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
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

	const submit = (event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }) =>
		event.currentTarget.form?.requestSubmit();
</script>

<svelte:head>
	<title>{m.attendance_entry_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.attendance_entry_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.attendance_entry_description()}</p>
	</div>

	<!-- A GET form: date and scope live in the URL, so the sheet survives a reload. -->
	<form method="GET" class="flex flex-wrap items-end gap-3" data-sveltekit-keepfocus>
		<label class="flex flex-col gap-1 text-sm font-medium">
			{m.attendance_field_date()}
			<Input
				type="date"
				name="date"
				value={data.sheet.shiftDate}
				max={data.sheet.today}
				onchange={submit}
				class="w-44"
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm font-medium">
			{m.attendance_field_scope()}
			<select
				name="scope"
				value={scopeValue}
				onchange={submit}
				class="h-9 min-w-56 rounded-md border border-input bg-background px-2 text-sm font-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<option value="">{m.attendance_pick_scope()}</option>
				<optgroup label={m.nav_departments()}>
					{#each data.sheet.departments as department (department.id)}
						<option value={`department:${department.id}`}>
							{' '.repeat(department.depth * 2)}{lookupName(department)}
						</option>
					{/each}
				</optgroup>
				<optgroup label={m.nav_teams()}>
					{#each data.sheet.teams as team (team.id)}
						<option value={`team:${team.id}`}>{lookupName(team)}</option>
					{/each}
				</optgroup>
			</select>
		</label>
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
</section>
