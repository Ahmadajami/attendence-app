<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		shiftStartsSchema,
		type SettingsMessage,
		type ShiftStartsSchema
	} from '#lib/schemas/settings.schema.js';

	type Props = { data: SuperValidated<Infer<ShiftStartsSchema>, SettingsMessage> };

	let { data }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(shiftStartsSchema),
			resetForm: false,
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') toast.success(form.message.text);
				else if (form.message?.kind === 'error') toast.error(form.message.text);
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed } = form;

	/** `HH:mm` 12 h later, for the "ends at" hint. */
	function plus12(time: string): string {
		const [h, min] = time.split(':').map(Number);
		if (Number.isNaN(h) || Number.isNaN(min)) return '';
		return `${String((h + 12) % 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
	}
</script>

<form method="POST" action="?/shiftStarts" class="flex flex-col gap-4" use:enhance>
	<div class="grid gap-4 sm:grid-cols-2">
		<Form.Field {form} name="day">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.settings_field_day_start()}</Form.Label>
					<Input {...props} type="time" bind:value={$formData.day} dir="ltr" />
				{/snippet}
			</Form.Control>
			<Form.Description>
				{m.settings_shift_ends({ time: plus12($formData.day) })}
			</Form.Description>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="night">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.settings_field_night_start()}</Form.Label>
					<Input {...props} type="time" bind:value={$formData.night} dir="ltr" />
				{/snippet}
			</Form.Control>
			<Form.Description>
				{m.settings_shift_ends_next_day({ time: plus12($formData.night) })}
			</Form.Description>
			<Form.FieldErrors />
		</Form.Field>
	</div>

	<Form.Button class="self-start" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.settings_save()}
	</Form.Button>
</form>
