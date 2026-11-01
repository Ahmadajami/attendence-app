<script lang="ts">
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import UserCheckIcon from 'phosphor-svelte/lib/UserCheckIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow } from '#lib/types/workforce.js';
	import { employeeName } from './labels.js';

	let {
		employee,
		onToggleActive
	}: {
		employee: StaffRow;
		onToggleActive: (employee: StaffRow) => void;
	} = $props();

	const name = $derived(employeeName(employee));
</script>

<!-- Edit (on the profile) and activate / deactivate, for a table row or a card. -->
<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" aria-label={m.staff_actions({ name })}>
				<DotsThreeIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<!-- Editing lives on the profile (redesign plan V8). -->
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href={localizedHref('/employees/[id]', { id: employee.id })} {...props}>
					<PencilSimpleIcon />
					{m.staff_edit()}
				</a>
			{/snippet}
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
