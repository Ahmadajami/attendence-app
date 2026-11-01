<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		profileNamesFormSchema,
		type ProfileMessage
	} from '#lib/schemas/staff-profile.schema.js';
	import type { ProfilePerson, StaffListOption } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof profileNamesFormSchema>, ProfileMessage>;
		person: ProfilePerson;
		/** Active job titles, plus the person's own if inactive. */
		jobTitles: StaffListOption[];
	};

	let { data, person, jobTitles }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(profileNamesFormSchema),
			...statusToasts()
		}
	);
	const { form: formData, enhance, delayed } = form;

	// Start from the saved values; the load reruns after a save, so this follows it.
	$effect(() => {
		$formData.firstNameEn = person.firstNameEn ?? '';
		$formData.lastNameEn = person.lastNameEn ?? '';
		$formData.firstNameAr = person.firstNameAr ?? '';
		$formData.lastNameAr = person.lastNameAr ?? '';
		$formData.jobTitleId = person.jobTitleId ?? '';
		$formData.personalEmail = person.personalEmail ?? '';
	});

	const jobTitleValue = $derived($formData.jobTitleId || 'none');
	const jobTitleLabel = $derived(jobTitles.find((t) => t.id === jobTitleValue));
</script>

<form method="POST" action="?/saveNames" class="flex max-w-xl flex-col gap-4" use:enhance>
	<div class="grid grid-cols-2 gap-4">
		{@render textField('firstNameEn', m.profile_field_first_name_en(), 'ltr')}
		{@render textField('lastNameEn', m.profile_field_last_name_en(), 'ltr')}
		{@render textField('firstNameAr', m.profile_field_first_name_ar(), 'rtl')}
		{@render textField('lastNameAr', m.profile_field_last_name_ar(), 'rtl')}
	</div>
	<p class="text-sm text-muted-foreground">{m.profile_names_hint()}</p>

	<Form.Field {form} name="jobTitleId">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_job_title()}</Form.Label>
				<!-- "No title" is the `none` item only inside the select; post '' or an id. -->
				<input type="hidden" name={props.name} value={$formData.jobTitleId} />
				<Select.Root
					type="single"
					value={jobTitleValue}
					onValueChange={(value) => ($formData.jobTitleId = value === 'none' ? '' : value)}
				>
					<Select.Trigger {...props} class="w-full">
						{jobTitleLabel ? lookupName(jobTitleLabel) : m.profile_no_job_title()}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="none" label={m.profile_no_job_title()} />
						{#each jobTitles as title (title.id)}
							<Select.Item value={title.id} label={lookupName(title)} />
						{/each}
					</Select.Content>
				</Select.Root>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="personalEmail">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_personal_email()}</Form.Label>
				<Input
					{...props}
					bind:value={$formData.personalEmail}
					type="email"
					dir="ltr"
					autocomplete="off"
				/>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Button class="w-full" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.profile_save()}
	</Form.Button>
</form>

{#snippet textField(
	name: 'firstNameEn' | 'lastNameEn' | 'firstNameAr' | 'lastNameAr',
	label: string,
	dir: 'ltr' | 'rtl'
)}
	<Form.Field {form} {name}>
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{label}</Form.Label>
				<Input {...props} bind:value={$formData[name]} {dir} autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
{/snippet}
