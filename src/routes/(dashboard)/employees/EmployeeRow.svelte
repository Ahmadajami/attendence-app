<script lang="ts">
	import { useDraggable } from '@dnd-kit-svelte/svelte';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import UserCheckIcon from 'phosphor-svelte/lib/UserCheckIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow } from '#lib/types/workforce.js';
	import { localizedHref } from '#lib/i18n.js';
	import { getPersonalPatternIds } from './context.js';
	import DragHandle from './DragHandle.svelte';
	import { employeeName, lookupName } from './labels.js';

	let {
		employee,
		from,
		team,
		onEdit,
		onToggleActive
	}: {
		employee: StaffRow;
		/** Id of the table this row is rendered in: `ALL_EMPLOYEES` or a team id. */
		from: string;
		/** Team cell for the All table: the team's name, `null` for no team, omitted to hide the column. */
		team?: string | null;
		/** When given, an actions menu is rendered (All table only). */
		onEdit?: (employee: StaffRow) => void;
		onToggleActive?: (employee: StaffRow) => void;
	} = $props();

	const name = $derived(employeeName(employee));
	const personalPatternIds = getPersonalPatternIds();

	// The same employee can be listed in All and in a team, so the draggable id includes the table.
	const { ref, handleRef, isDragging } = useDraggable({
		id: () => `${from}:${employee.id}`,
		type: 'employee',
		data: () => ({ employeeId: employee.id, from })
	});
</script>

<Table.Row {@attach ref} data-dragging={isDragging.current} class="data-[dragging=true]:opacity-40">
	<Table.Cell class="w-8 pe-0">
		{#if employee.active}
			<DragHandle attach={handleRef} label={m.drag_handle_label({ name })} />
		{/if}
	</Table.Cell>
	<Table.Cell class="font-mono text-muted-foreground">
		<bdi dir="ltr">{employee.employeeNo}</bdi>
	</Table.Cell>
	<Table.Cell class="font-medium">
		<a
			href={localizedHref('/employees/[id]', { id: employee.id })}
			class={['hover:underline', !employee.active && 'text-muted-foreground line-through']}
		>
			{name}
		</a>
		{#if !employee.active}
			<Badge variant="outline" class="ms-2">{m.staff_status_inactive()}</Badge>
		{/if}
		{#if personalPatternIds().has(employee.id)}
			<Badge variant="secondary" class="ms-2">{m.roster_personal_badge()}</Badge>
		{/if}
	</Table.Cell>
	<Table.Cell>
		<Badge variant="outline">{lookupName(employee.function)}</Badge>
	</Table.Cell>
	{#if team !== undefined}
		<Table.Cell class={team === null ? 'text-muted-foreground' : undefined}>
			{team ?? m.employees_no_team()}
		</Table.Cell>
	{/if}
	{#if onEdit && onToggleActive}
		<Table.Cell class="text-end">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon" aria-label={m.staff_actions({ name })}>
							<DotsThreeIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onSelect={() => onEdit(employee)}>
						<PencilSimpleIcon />
						{m.staff_edit()}
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						variant={employee.active ? 'destructive' : 'default'}
						onSelect={() => onToggleActive(employee)}
					>
						{#if employee.active}
							<ProhibitIcon />
							{m.staff_deactivate()}
						{:else}
							<UserCheckIcon />
							{m.staff_activate()}
						{/if}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</Table.Cell>
	{/if}
</Table.Row>
