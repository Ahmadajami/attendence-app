<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createDroppable } from '@dnd-kit/svelte';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow, TeamOption } from '#lib/types/workforce.js';
	import { cn } from '#lib/utils.js';
	import EmployeeRow from './EmployeeRow.svelte';
	import { ALL_EMPLOYEES, searchEmployees, teamName } from './labels.js';

	let {
		employees,
		teamById,
		onToggleActive,
		filter,
		class: className
	}: {
		employees: StaffRow[];
		teamById: Map<string, TeamOption>;
		onToggleActive: (employee: StaffRow) => void;
		/** The status filter (M22), beside the search; absent while everyone is active. */
		filter?: Snippet;
		class?: string;
	} = $props();

	let query = $state('');

	const filtered = $derived(searchEmployees(employees, query));

	// Dropping a team member here removes them from their team.
	const droppable = createDroppable({ id: ALL_EMPLOYEES, accept: 'employee' });
</script>

<Card.Root class={className}>
	<Card.Header>
		<Card.Title>{m.employees_all()}</Card.Title>
		<Card.Description>{m.employees_count({ count: employees.length })}</Card.Description>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<InputGroup.Root class="min-w-48 flex-1">
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
			{@render filter?.()}
		</div>
	</Card.Header>
	<Card.Content
		{@attach droppable.attach}
		class={cn(
			'min-h-0 flex-1 overflow-y-auto transition-colors',
			droppable.isDropTarget && 'bg-muted'
		)}
	>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-8"></Table.Head>
					<Table.Head>{m.employees_col_no()}</Table.Head>
					<Table.Head>{m.employees_col_name()}</Table.Head>
					<Table.Head>{m.employees_col_department()}</Table.Head>
					<Table.Head>{m.employees_col_team()}</Table.Head>
					<Table.Head><span class="sr-only">{m.staff_actions({ name: '' })}</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each filtered as employee (employee.id)}
					{const team = $derived(employee.team ? teamById.get(employee.team.id) : undefined)}
					<EmployeeRow
						{employee}
						from={ALL_EMPLOYEES}
						team={team ? teamName(team) : null}
						{onToggleActive}
					/>
				{:else}
					<Table.Row>
						<Table.Cell colspan={6} class="h-20 text-center text-muted-foreground">
							{m.employees_no_results()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
