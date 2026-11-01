<script lang="ts">
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import Empty from '#lib/app/state/Empty.svelte';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow } from '#lib/types/workforce.js';
	import EmployeeCard from './EmployeeCard.svelte';
	import { searchEmployees } from './labels.js';

	let {
		employees,
		onToggleActive
	}: {
		employees: StaffRow[];
		onToggleActive: (employee: StaffRow) => void;
	} = $props();

	let query = $state('');
	const filtered = $derived(searchEmployees(employees, query));
</script>

<!-- The employees as cards (the "Employees" tab); moving people between teams is the other tab. -->
<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<InputGroup.Root class="max-w-sm">
			<InputGroup.Addon>
				<MagnifyingGlassIcon />
			</InputGroup.Addon>
			<InputGroup.Input
				type="search"
				bind:value={query}
				placeholder={m.employees_search()}
				aria-label={m.employees_search()}
			/>
		</InputGroup.Root>
		<p class="text-xs text-muted-foreground">{m.employees_count({ count: filtered.length })}</p>
	</div>

	{#if filtered.length > 0}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
			{#each filtered as employee (employee.id)}
				<EmployeeCard {employee} {onToggleActive} />
			{/each}
		</div>
	{:else}
		<Empty icon={MagnifyingGlassIcon} title={m.employees_no_results()} />
	{/if}
</section>
