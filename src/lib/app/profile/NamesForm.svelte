<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import ListSelect from '#lib/app/staff-lists/ListSelect.svelte';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		profileNamesFormSchema,
		type ProfileMessage
	} from '#lib/schemas/staff-profile.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	type Props = {
		/** The page's names form, holding the saved values (the sheet remounts it on open). */
		data: SuperValidated<Infer<typeof profileNamesFormSchema>, ProfileMessage>;
		/** Every job title; the picker offers the active ones and the person's own. */
		jobTitles: StaffListOption[];
		/** After a save: close the sheet. */
		onDone: () => void;
	};

	let { data, jobTitles, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(profileNamesFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<form method="POST" action="?/saveNames" class="flex flex-col gap-4" use:enhance>
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
				<!-- The picker's placeholder items are never posted: post '' or an id. -->
				<input type="hidden" name={props.name} value={$formData.jobTitleId} />
				<ListSelect
					{...props}
					bind:value={$formData.jobTitleId}
					items={jobTitles}
					kind="job_title"
					placeholder={m.profile_no_job_title()}
					allowNone
					noneLabel={m.profile_no_job_title()}
				/>
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
