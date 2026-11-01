<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { experienceFormSchema, ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileExperience } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import ExperienceForm from './ExperienceForm.svelte';
	import { dateRange, experienceText } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof experienceFormSchema>, ProfileMessage>;
		experience: ProfileExperience[];
		/** Computed total (earlier jobs and the time here, overlaps once). */
		totalMonths: number;
		/** The person's start date here, `null` when unknown. */
		startDate: string | null;
	};

	let { data, experience, totalMonths, startDate }: Props = $props();

	let editing = $state<ProfileExperience | null>(null);
</script>

<div class="grid gap-8 lg:grid-cols-2">
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1 text-sm">
			<p>
				<span class="text-muted-foreground">{m.profile_experience_total()}</span>
				<span class="font-medium">{experienceText(totalMonths)}</span>
			</p>
			<p class="text-muted-foreground">
				{#if startDate}
					{m.profile_experience_here_since()}
					<bdi>{formatDate(startDate)}</bdi>
				{:else}
					{m.profile_experience_no_start_date()}
				{/if}
			</p>
		</div>

		{#if experience.length === 0}
			<p class="text-sm text-muted-foreground">{m.profile_experience_empty()}</p>
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
								onclick={() => (editing = job)}
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
	</div>

	<ExperienceForm {data} {editing} onDone={() => (editing = null)} />
</div>
