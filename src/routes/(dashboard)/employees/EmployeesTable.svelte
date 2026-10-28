<script lang="ts">
	import { useDroppable } from '@dnd-kit-svelte/svelte';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow, TeamOption } from '#lib/types/workforce.js';
	import { cn } from '#lib/utils.js';
	import EmployeeRow from './EmployeeRow.svelte';
	import { ALL_EMPLOYEES, teamName } from './labels.js';

	let {
		employees,
		teamById,
		onEdit,
		onToggleActive,
		class: className
	}: {
		employees: StaffRow[];
		teamById: Map<string, TeamOption>;
		onEdit: (employee: StaffRow) => void;
		onToggleActive: (employee: StaffRow) => void;
		class?: string;
	} = $props();

	let query = $state('');

	const filtered = $derived.by(() => {
		const q = query.trim().toLocaleLowerCase();
		if (!q) return employees;
		return employees.filter(
			(e) =>
				e.employeeNo.includes(q) ||
				e.fullName.toLocaleLowerCase().includes(q) ||
				(e.fullNameAr?.includes(q) ?? false)
		);
	});

	// Dropping a team member here removes them from their team.
	const { ref, isDropTarget } = useDroppable({ id: ALL_EMPLOYEES, accept: 'employee' });
</script>

<Card.Root class={className}>
	<Card.Header>
		<Card.Title>{m.employees_all()}</Card.Title>
		<Card.Description>{m.employees_count({ count: employees.length })}</Card.Description>
		<InputGroup.Root class="mt-2">
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
	</Card.Header>
	<Card.Content
		{@attach ref}
		class={cn(
			'min-h-0 flex-1 overflow-y-auto transition-colors',
			isDropTarget.current && 'bg-muted'
		)}
	>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-8"></Table.Head>
					<Table.Head>{m.employees_col_no()}</Table.Head>
					<Table.Head>{m.employees_col_name()}</Table.Head>
					<Table.Head>{m.employees_col_function()}</Table.Head>
					<Table.Head>{m.employees_col_team()}</Table.Head>
					<Table.Head><span class="sr-only">{m.staff_actions({ name: '' })}</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each filtered as employee (employee.id)}
					{@const team = employee.team ? teamById.get(employee.team.id) : undefined}
					<EmployeeRow
						{employee}
						from={ALL_EMPLOYEES}
						team={team ? teamName(team) : null}
						{onEdit}
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
