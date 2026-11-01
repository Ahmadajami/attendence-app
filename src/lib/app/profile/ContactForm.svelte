<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { contactFormSchema, type ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileContact } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	type Props = {
		data: SuperValidated<Infer<typeof contactFormSchema>, ProfileMessage>;
		/** The contact being edited; `null` adds one. */
		editing: ProfileContact | null;
		/** After a save: close the sheet. */
		onDone: () => void;
	};

	let { data, editing, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(contactFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.contactId = editing?.id ?? '';
		$formData.name = editing?.name ?? '';
		$formData.relationship = editing?.relationship ?? '';
		$formData.phone = editing?.phone ?? '';
		$formData.phone2 = editing?.phone2 ?? '';
	});
</script>

<form method="POST" action="?/saveContact" class="flex flex-col gap-4" use:enhance>
	<input type="hidden" name="contactId" value={$formData.contactId} />

	<Form.Field {form} name="name">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_contact_name()}</Form.Label>
				<Input {...props} bind:value={$formData.name} autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="relationship">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_relationship()}</Form.Label>
				<Input {...props} bind:value={$formData.relationship} autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<div class="grid grid-cols-2 gap-4">
		<Form.Field {form} name="phone">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_phone()}</Form.Label>
					<Input {...props} bind:value={$formData.phone} type="tel" dir="ltr" autocomplete="off" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="phone2">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_phone_2()}</Form.Label>
					<Input {...props} bind:value={$formData.phone2} type="tel" dir="ltr" autocomplete="off" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	</div>

	<Form.Button class="w-full" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{editing ? m.profile_save() : m.profile_add()}
	</Form.Button>
</form>
