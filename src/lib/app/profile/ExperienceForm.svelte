<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { experienceFormSchema, type ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileExperience } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	type Props = {
		data: SuperValidated<Infer<typeof experienceFormSchema>, ProfileMessage>;
		/** The job being edited; `null` adds one. */
		editing: ProfileExperience | null;
		/** After a save or a cancel: stop editing. */
		onDone: () => void;
	};

	let { data, editing, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(experienceFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.experienceId = editing?.id ?? '';
		$formData.employer = editing?.employer ?? '';
		$formData.jobTitle = editing?.jobTitle ?? '';
		$formData.startedOn = editing?.startedOn ?? '';
		$formData.endedOn = editing?.endedOn ?? '';
		$formData.note = editing?.note ?? '';
	});
</script>

<form method="POST" action="?/saveExperience" class="flex flex-col gap-4" use:enhance>
	<h4 class="font-medium">{editing ? m.profile_experience_edit() : m.profile_experience_add()}</h4>
	<input type="hidden" name="experienceId" value={$formData.experienceId} />

	<Form.Field {form} name="jobTitle">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_experience_job_title()}</Form.Label>
				<Input {...props} bind:value={$formData.jobTitle} autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="employer">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_employer()}</Form.Label>
				<Input {...props} bind:value={$formData.employer} autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<div class="grid grid-cols-2 gap-4">
		<Form.Field {form} name="startedOn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_started_on()}</Form.Label>
					<Input {...props} bind:value={$formData.startedOn} type="date" dir="ltr" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="endedOn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_ended_on()}</Form.Label>
					<Input {...props} bind:value={$formData.endedOn} type="date" dir="ltr" />
				{/snippet}
			</Form.Control>
			<Form.Description>{m.profile_ended_on_hint()}</Form.Description>
			<Form.FieldErrors />
		</Form.Field>
	</div>

	<Form.Field {form} name="note">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_note()}</Form.Label>
				<Textarea {...props} bind:value={$formData.note} rows={2} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<div class="flex gap-2">
		<Form.Button class="flex-1" disabled={$delayed}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{editing ? m.profile_save() : m.profile_add()}
		</Form.Button>
		{#if editing}
			<Button type="button" variant="outline" onclick={onDone}>{m.profile_cancel()}</Button>
		{/if}
	</div>
</form>
