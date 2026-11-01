<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		profileIdentityFormSchema,
		type ProfileMessage
	} from '#lib/schemas/staff-profile.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	type Props = {
		/** The page's identity form, holding the saved values (the sheet remounts it on open). */
		data: SuperValidated<Infer<typeof profileIdentityFormSchema>, ProfileMessage>;
		/** After a save: close the sheet. */
		onDone: () => void;
	};

	let { data, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(profileIdentityFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;

	type TextName =
		| 'fatherNameEn'
		| 'fatherNameAr'
		| 'motherNameEn'
		| 'motherNameAr'
		| 'nationalIdNo'
		| 'passportNo';
</script>

<!-- Parents' names and the ID card / passport (profile plan H13). Every field is optional. -->
<form method="POST" action="?/saveIdentity" class="flex flex-col gap-4" use:enhance>
	<h3 class="font-medium">{m.profile_parents_title()}</h3>
	<div class="grid grid-cols-2 gap-4">
		{@render textField('fatherNameEn', m.profile_field_father_name_en(), 'ltr')}
		{@render textField('fatherNameAr', m.profile_field_father_name_ar(), 'rtl')}
		{@render textField('motherNameEn', m.profile_field_mother_name_en(), 'ltr')}
		{@render textField('motherNameAr', m.profile_field_mother_name_ar(), 'rtl')}
	</div>

	<Separator />

	<h3 class="font-medium">{m.profile_id_documents_title()}</h3>
	{@render textField('nationalIdNo', m.profile_field_national_id_no(), 'ltr')}
	<div class="grid grid-cols-2 gap-4">
		{@render dateField('nationalIdIssuedOn', m.profile_field_national_id_issued_on())}
		{@render dateField('nationalIdExpiresOn', m.profile_field_national_id_expires_on())}
	</div>
	{@render textField('passportNo', m.profile_field_passport_no(), 'ltr')}

	<Form.Button class="w-full" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.profile_save()}
	</Form.Button>
</form>

{#snippet textField(name: TextName, label: string, dir: 'ltr' | 'rtl')}
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

{#snippet dateField(name: 'nationalIdIssuedOn' | 'nationalIdExpiresOn', label: string)}
	<Form.Field {form} {name}>
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{label}</Form.Label>
				<Input {...props} bind:value={$formData[name]} type="date" dir="ltr" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
{/snippet}
