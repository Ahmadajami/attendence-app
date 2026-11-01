<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		CUSTODY_STATUSES,
		custodyFormSchema,
		type CustodyStatus,
		type ProfileMessage
	} from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileCustodyItem, StaffListOption } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { custodyStatusLabel } from './labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof custodyFormSchema>, ProfileMessage>;
		/** Active item types, plus inactive ones the person holds. */
		types: StaffListOption[];
		/** The item being changed; `null` hands one out. */
		editing: ProfileCustodyItem | null;
		today: string;
		/** After a save or a cancel: stop editing. */
		onDone: () => void;
	};

	let { data, types, editing, today, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(custodyFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.custodyId = editing?.id ?? '';
		$formData.itemTypeId = editing?.itemTypeId ?? '';
		$formData.identifier = editing?.identifier ?? '';
		$formData.issuedOn = editing?.issuedOn ?? today;
		$formData.status = (editing?.status as CustodyStatus | undefined) ?? 'with_employee';
		$formData.statusOn = editing?.statusOn ?? '';
		$formData.note = editing?.note ?? '';
	});

	/** New items take an active type; an existing one keeps its own even if inactive. */
	const typeOptions = $derived(types.filter((t) => t.active || t.id === editing?.itemTypeId));
	const selectedType = $derived(typeOptions.find((t) => t.id === $formData.itemTypeId));
</script>

<form method="POST" action="?/saveCustody" class="flex flex-col gap-4" use:enhance>
	<h4 class="font-medium">{editing ? m.profile_custody_edit() : m.profile_custody_add()}</h4>
	<input type="hidden" name="custodyId" value={$formData.custodyId} />

	<Form.Field {form} name="itemTypeId">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_custody_type()}</Form.Label>
				<Select.Root type="single" name={props.name} bind:value={$formData.itemTypeId}>
					<Select.Trigger {...props} class="w-full">
						{selectedType ? lookupName(selectedType) : m.profile_custody_type_placeholder()}
					</Select.Trigger>
					<Select.Content>
						{#each typeOptions as type (type.id)}
							<Select.Item value={type.id} label={lookupName(type)} />
						{/each}
					</Select.Content>
				</Select.Root>
			{/snippet}
		</Form.Control>
		{#if typeOptions.length === 0}
			<Form.Description>{m.profile_custody_no_types()}</Form.Description>
		{/if}
		<Form.FieldErrors />
	</Form.Field>

	<div class="grid grid-cols-2 gap-4">
		<Form.Field {form} name="identifier">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_identifier()}</Form.Label>
					<Input {...props} bind:value={$formData.identifier} dir="ltr" autocomplete="off" />
				{/snippet}
			</Form.Control>
			<Form.Description>{m.profile_identifier_hint()}</Form.Description>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="issuedOn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_issued_on()}</Form.Label>
					<Input {...props} bind:value={$formData.issuedOn} type="date" dir="ltr" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	</div>

	<div class="grid grid-cols-2 gap-4">
		<Form.Field {form} name="status">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_custody_status()}</Form.Label>
					<Select.Root
						type="single"
						name={props.name}
						bind:value={$formData.status}
						onValueChange={(value) => {
							if (value === 'with_employee') $formData.statusOn = '';
							else if (!$formData.statusOn) $formData.statusOn = today;
						}}
					>
						<Select.Trigger {...props} class="w-full">
							{custodyStatusLabel($formData.status)}
						</Select.Trigger>
						<Select.Content>
							{#each CUSTODY_STATUSES as status (status)}
								<Select.Item value={status} label={custodyStatusLabel(status)} />
							{/each}
						</Select.Content>
					</Select.Root>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		{#if $formData.status !== 'with_employee'}
			<Form.Field {form} name="statusOn">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.profile_field_status_on()}</Form.Label>
						<Input {...props} bind:value={$formData.statusOn} type="date" dir="ltr" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		{/if}
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
