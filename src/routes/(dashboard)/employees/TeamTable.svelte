<script lang="ts">
	import { useDroppable } from '@dnd-kit-svelte/svelte';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow, TeamOption } from '#lib/types/workforce.js';
	import { cn } from '#lib/utils.js';
	import EmployeeRow from './EmployeeRow.svelte';
	import { teamName } from './labels.js';

	let { team, members }: { team: TeamOption; members: StaffRow[] } = $props();

	const { ref, isDropTarget } = useDroppable({
		id: () => team.id,
		type: 'team',
		accept: 'employee'
	});
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{teamName(team)}</Card.Title>
		<Card.Description>{m.employees_count({ count: members.length })}</Card.Description>
	</Card.Header>
	<Card.Content
		{@attach ref}
		class={cn('min-h-24 transition-colors', isDropTarget.current && 'bg-muted')}
	>
		{#if members.length > 0}
			<Table.Root>
				<Table.Body>
					{#each members as employee (employee.id)}
						<EmployeeRow {employee} from={team.id} />
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<div
				class="flex h-24 flex-col items-center justify-center gap-1 text-muted-foreground outline-1 -outline-offset-1 outline-muted-foreground/30 outline-dashed"
			>
				<UsersThreeIcon class="size-5" />
				<span>{m.team_drop_here()}</span>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
