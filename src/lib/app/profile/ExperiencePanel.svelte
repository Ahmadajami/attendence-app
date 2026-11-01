<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import BriefcaseIcon from 'phosphor-svelte/lib/BriefcaseIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { experienceFormSchema, ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileExperience } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import ExperienceForm from './ExperienceForm.svelte';
	import FormSheet from './FormSheet.svelte';
	import { dateRange, experienceText } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof experienceFormSchema>, ProfileMessage>;
		experience: ProfileExperience[];
		/** Computed total (earlier jobs and the time here, overlaps once). */
		totalMonths: number;
		/** The person's start date here, `null` when unknown. */
		startDate: string | null;
		/** The person's name, for the sheet's description. */
		name: string;
	};

	let { data, experience, totalMonths, startDate, name }: Props = $props();

	let open = $state(false);
	let editing = $state<ProfileExperience | null>(null);

	function openForm(job: ProfileExperience | null) {
		editing = job;
		open = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_experience_title()}</Card.Title>
		<Card.Description>
			{m.profile_experience_total()}
			<span class="font-medium text-foreground">{experienceText(totalMonths)}</span>
			·
			{#if startDate}
				{m.profile_experience_here_since()}
				<bdi>{formatDate(startDate)}</bdi>
			{:else}
				{m.profile_experience_no_start_date()}
			{/if}
		</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => openForm(null)}>
				<PlusIcon data-icon="inline-start" />
				{m.profile_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if experience.length === 0}
			<Empty icon={BriefcaseIcon} title={m.profile_experience_empty()} />
		{:else}
			<ul class="flex flex-col gap-3">
				{#each experience as job (job.id)}
					<li class="flex items-start justify-between gap-2 text-sm">
						<div class="flex flex-col">
							<span class="font-medium">{job.jobTitle}</span>
							<span>{job.employer}</span>
							<bdi class="text-muted-foreground">{dateRange(job.startedOn, job.endedOn)}</bdi>
							{#if job.note}
								<span class="text-muted-foreground">{job.note}</span>
							{/if}
						</div>
						<div class="flex">
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.profile_edit_item({ name: job.jobTitle })}
								onclick={() => openForm(job)}
							>
								<PencilSimpleIcon />
							</Button>
							<RemoveItemButton
								kind="experience"
								itemId={job.id}
								label={m.profile_remove_item({ name: job.jobTitle })}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

<FormSheet
	title={editing ? m.profile_experience_edit() : m.profile_experience_add()}
	description={name}
	bind:open
>
	<ExperienceForm {data} {editing} onDone={() => (open = false)} />
</FormSheet>
