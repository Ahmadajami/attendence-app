<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import Empty from '#lib/app/state/Empty.svelte';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { JobHolder, JobRow } from '#lib/types/jobs.js';
	import { endSide, lookupName, personName } from '#lib/utils/locale.js';

	type Props = {
		/** The job whose holders are shown; `null` while nothing was picked. */
		job: JobRow | null;
		/** That job's holders, active and inactive. */
		holders: JobHolder[];
		open: boolean;
	};

	let { job, holders, open = $bindable() }: Props = $props();

	const active = $derived(holders.filter((holder) => holder.active));
	const inactive = $derived(holders.filter((holder) => !holder.active));

	/** The profile's Personal tab, where the job is changed. */
	function profileHref(id: string): string {
		return `${localizedHref('/employees/[id]', { id })}?tab=personal`;
	}
</script>

<!-- Who holds a job (jobs plan JB7): read-only; the job is changed on the profile. -->
<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>{job ? lookupName(job) : m.jobs_menu_people()}</Sheet.Title>
			<Sheet.Description>{m.jobs_holders_description()}</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-col gap-4 px-4 pb-4">
			{#if holders.length === 0}
				<Empty icon={UsersThreeIcon} title={m.jobs_holders_empty()} />
			{:else}
				{#if active.length > 0}
					{@render list(active)}
				{/if}
				{#if inactive.length > 0}
					<details class="group flex flex-col gap-2">
						<summary
							class="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-muted-foreground"
						>
							<CaretDownIcon class="size-4 transition-transform group-open:rotate-180" />
							{m.jobs_holders_inactive({ count: inactive.length })}
						</summary>
						{@render list(inactive)}
					</details>
				{/if}
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>

{#snippet list(people: JobHolder[])}
	<ul class="flex flex-col divide-y divide-border">
		{#each people as person (person.id)}
			<li class="flex flex-col gap-0.5 py-2">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() resolves; only `?tab=` is added -->
				<a href={profileHref(person.id)} class="font-medium hover:underline">
					{personName(person)}
				</a>
				<span class="text-xs text-muted-foreground">
					<bdi>{person.employeeNo}</bdi>
					·
					{person.team ? lookupName(person.team) : m.jobs_holders_no_team()}
				</span>
			</li>
		{/each}
	</ul>
{/snippet}
