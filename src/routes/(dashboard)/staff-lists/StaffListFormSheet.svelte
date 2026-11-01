<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		staffListFormSchema,
		type StaffListKind,
		type StaffListMessage
	} from '#lib/schemas/staff-lists.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide } from '#lib/utils/locale.js';
	import { kindTitle } from '#lib/app/staff-lists/labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof staffListFormSchema>, StaffListMessage>;
		kind: StaffListKind;
		/** The item being edited; `null` creates one. */
		target: StaffListOption | null;
		open: boolean;
	};

	let { data, kind, target, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(staffListFormSchema),
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.kind = kind;
		$formData.itemId = target?.id ?? '';
		$formData.nameEn = target?.nameEn ?? '';
		$formData.nameAr = target?.nameAr ?? '';
		$formData.required = target?.required ?? false;
	});
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()}>
		<Sheet.Header>
			<Sheet.Title>{target ? m.staff_lists_edit() : m.staff_lists_new()}</Sheet.Title>
			<Sheet.Description>{kindTitle(kind)}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/save" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="kind" value={$formData.kind} />
			<input type="hidden" name="itemId" value={$formData.itemId} />

			<Form.Field {form} name="nameEn">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_lists_field_name_en()}</Form.Label>
						<Input {...props} bind:value={$formData.nameEn} dir="ltr" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="nameAr">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_lists_field_name_ar()}</Form.Label>
						<Input {...props} bind:value={$formData.nameAr} dir="rtl" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			{#if kind === 'document_type'}
				<Form.Field {form} name="required">
					<Form.Control>
						{#snippet children({ props })}
							<div class="flex items-center justify-between gap-4">
								<div class="flex flex-col gap-1">
									<Form.Label>{m.staff_lists_field_required()}</Form.Label>
									<Form.Description>{m.staff_lists_required_hint()}</Form.Description>
								</div>
								<Switch {...props} bind:checked={$formData.required} />
							</div>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			{/if}

			<Form.Button class="w-full" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{target ? m.staff_lists_save() : m.staff_lists_create_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
