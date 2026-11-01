<script lang="ts">
	import BuildingsIcon from 'phosphor-svelte/lib/BuildingsIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow } from '#lib/types/workforce.js';
	import { initials } from '#lib/workforce/profile.js';
	import { getPersonalPatternIds } from './context.js';
	import EmployeeActions from './EmployeeActions.svelte';
	import { employeeName, lookupName, teamName } from './labels.js';

	let {
		employee,
		onToggleActive
	}: {
		employee: StaffRow;
		onToggleActive: (employee: StaffRow) => void;
	} = $props();

	const name = $derived(employeeName(employee));
	const personalPatternIds = getPersonalPatternIds();
</script>

<Card.Root size="sm">
	<Card.Content class="flex flex-col gap-3">
		<div class="flex items-start gap-3">
			<Avatar.Root class="size-10">
				<Avatar.Fallback class="font-medium">{initials(name)}</Avatar.Fallback>
				<Avatar.Badge class={['size-3', employee.active ? 'bg-primary' : 'bg-muted-foreground']}>
					<span class="sr-only">
						{employee.active ? m.profile_header_status_active() : m.staff_status_inactive()}
					</span>
				</Avatar.Badge>
			</Avatar.Root>

			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<a
					href={localizedHref('/employees/[id]', { id: employee.id })}
					class={[
						'truncate text-sm font-medium hover:underline',
						!employee.active && 'text-muted-foreground line-through'
					]}
				>
					{name}
				</a>
				<p class="truncate text-muted-foreground">
					<bdi dir="ltr" class="font-mono">{employee.employeeNo}</bdi>
					{#if employee.jobTitle}
						· {lookupName(employee.jobTitle)}
					{/if}
				</p>
			</div>

			<EmployeeActions {employee} {onToggleActive} />
		</div>

		<div class="flex flex-col gap-1 text-muted-foreground">
			<p class="flex items-center gap-1.5">
				<BuildingsIcon class="size-3.5 shrink-0" />
				<span class={['truncate', employee.department && 'text-foreground']}>
					{employee.department ? lookupName(employee.department) : '—'}
				</span>
			</p>
			<p class="flex items-center gap-1.5">
				<UsersThreeIcon class="size-3.5 shrink-0" />
				<span class={['truncate', employee.team && 'text-foreground']}>
					{employee.team ? teamName(employee.team) : m.employees_no_team()}
				</span>
			</p>
		</div>

		{#if !employee.active || personalPatternIds().has(employee.id)}
			<div class="flex flex-wrap gap-1">
				{#if !employee.active}
					<Badge variant="outline">{m.staff_status_inactive()}</Badge>
				{/if}
				{#if personalPatternIds().has(employee.id)}
					<Badge variant="secondary">{m.roster_personal_badge()}</Badge>
				{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
