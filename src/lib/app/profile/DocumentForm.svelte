<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { documentFormSchema, type ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileDocument } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof documentFormSchema>, ProfileMessage>;
		/** The document type being recorded. */
		document: ProfileDocument;
		today: string;
		/** After a save or a cancel: close the form. */
		onDone: () => void;
	};

	let { data, document, today, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(documentFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		const record = document.record;
		$formData.documentTypeId = document.type.id;
		$formData.received = record?.received ?? false;
		$formData.receivedOn = record?.receivedOn ?? '';
		$formData.referenceNo = record?.referenceNo ?? '';
		$formData.expiresOn = record?.expiresOn ?? '';
		$formData.note = record?.note ?? '';
	});
</script>

<form method="POST" action="?/setDocument" class="flex flex-col gap-4" use:enhance>
	<h4 class="font-medium">{m.profile_document_edit({ name: lookupName(document.type) })}</h4>
	<input type="hidden" name="documentTypeId" value={$formData.documentTypeId} />

	<Form.Field {form} name="received" class="flex flex-row items-center gap-2">
		<Form.Control>
			{#snippet children({ props })}
				<Checkbox
					{...props}
					bind:checked={$formData.received}
					onCheckedChange={(checked) => {
						if (checked && !$formData.receivedOn) $formData.receivedOn = today;
					}}
				/>
				<Form.Label>{m.profile_field_received()}</Form.Label>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	{#if $formData.received}
		<Form.Field {form} name="receivedOn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_received_on()}</Form.Label>
					<Input {...props} bind:value={$formData.receivedOn} type="date" dir="ltr" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	{/if}

	<div class="grid grid-cols-2 gap-4">
		<Form.Field {form} name="referenceNo">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_reference_no()}</Form.Label>
					<Input {...props} bind:value={$formData.referenceNo} dir="ltr" autocomplete="off" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="expiresOn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_expires_on()}</Form.Label>
					<Input {...props} bind:value={$formData.expiresOn} type="date" dir="ltr" />
				{/snippet}
			</Form.Control>
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
			{m.profile_save()}
		</Form.Button>
		<Button type="button" variant="outline" onclick={onDone}>{m.profile_cancel()}</Button>
	</div>
</form>
