<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow } from '#lib/types/workforce.js';
	import { localizedHref } from '#lib/i18n.js';
	import { getPersonalPatternIds } from './context.js';
	import DragHandle from './DragHandle.svelte';
	import EmployeeActions from './EmployeeActions.svelte';
	import { employeeName, lookupName } from './labels.js';

	let {
		employee,
		from,
		team,
		onToggleActive
	}: {
		employee: StaffRow;
		/** Id of the table this row is rendered in: `ALL_EMPLOYEES` or a team id. */
		from: string;
		/** Team cell for the All table: the team's name, `null` for no team, omitted to hide the column. */
		team?: string | null;
		/** When given, an actions menu is rendered (All table only). */
		onToggleActive?: (employee: StaffRow) => void;
	} = $props();

	const name = $derived(employeeName(employee));
	const personalPatternIds = getPersonalPatternIds();

	// The same employee can be listed in All and in a team, so the draggable id includes the table.
	const draggable = createDraggable({
		get id() {
			return `${from}:${employee.id}`;
		},
		type: 'employee',
		get data() {
			return { employeeId: employee.id, from };
		}
	});
</script>

<Table.Row
	{@attach draggable.attach}
	data-dragging={draggable.isDragging}
	class="data-[dragging=true]:opacity-40"
>
	<Table.Cell class="w-8 pe-0">
		{#if employee.active}
			<DragHandle attach={draggable.attachHandle} label={m.drag_handle_label({ name })} />
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
		{#if employee.jobTitle}
			<p class="text-xs font-normal text-muted-foreground">{lookupName(employee.jobTitle)}</p>
		{/if}
	</Table.Cell>
	<Table.Cell class={employee.department ? undefined : 'text-muted-foreground'}>
		{employee.department ? lookupName(employee.department) : '—'}
	</Table.Cell>
	{#if team !== undefined}
		<Table.Cell class={team === null ? 'text-muted-foreground' : undefined}>
			{team ?? m.employees_no_team()}
		</Table.Cell>
	{/if}
	{#if onToggleActive}
		<Table.Cell class="text-end">
			<EmployeeActions {employee} {onToggleActive} />
		</Table.Cell>
	{/if}
</Table.Row>
