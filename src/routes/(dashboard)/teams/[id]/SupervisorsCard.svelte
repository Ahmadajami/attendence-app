<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffOption, SupervisorRow } from '#lib/server/services/roster/roster.crud.js';
	import { personName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';

	type Props = {
		supervisors: SupervisorRow[];
		/** Active staff who can be added; empty when the viewer can't manage rosters. */
		staffOptions: StaffOption[];
		canManage: boolean;
	};

	let { supervisors, staffOptions, canManage }: Props = $props();

	let staffId = $state('');

	const available = $derived(
		staffOptions.filter((o) => !supervisors.some((s) => s.staffId === o.staffId))
	);
	const selected = $derived(available.find((o) => o.staffId === staffId));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.roster_supervisors_title()}</Card.Title>
		<Card.Description>{m.roster_supervisors_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if supervisors.length === 0}
			<p class="text-sm text-muted-foreground">{m.roster_supervisors_empty()}</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each supervisors as supervisor (supervisor.id)}
					<li class="flex items-center justify-between gap-2">
						<a
							href={localizedHref('/employees/[id]', { id: supervisor.staffId })}
							class="font-medium hover:underline"
						>
							{personName(supervisor)}
						</a>
						{#if canManage}
							<form method="POST" action="?/removeSupervisor" use:enhance={toastNotice}>
								<input type="hidden" name="supervisorId" value={supervisor.id} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									aria-label={m.roster_supervisor_remove({ name: personName(supervisor) })}
								>
									<XIcon />
								</Button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if canManage}
			<form
				method="POST"
				action="?/addSupervisor"
				class="flex flex-wrap items-center gap-2"
				use:enhance={toastNotice}
			>
				<Select.Root type="single" name="staffId" bind:value={staffId}>
					<Select.Trigger class="min-w-56" aria-label={m.roster_supervisor_pick()}>
						{selected ? personName(selected) : m.roster_supervisor_pick()}
					</Select.Trigger>
					<Select.Content>
						{#each available as option (option.staffId)}
							<Select.Item value={option.staffId} label={personName(option)} />
						{/each}
					</Select.Content>
				</Select.Root>
				<!-- Once added, the person leaves `available`, so a stale `staffId` can't be posted again. -->
				<Button type="submit" variant="outline" disabled={!selected}>
					<PlusIcon data-icon="inline-start" />
					{m.roster_supervisor_add()}
				</Button>
			</form>
		{/if}
	</Card.Content>
</Card.Root>
