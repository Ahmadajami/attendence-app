<script lang="ts">
	import { untrack } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { normalizeClock } from '#lib/attendance/entry.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		correctionSchema,
		type AttendanceMessage,
		type CorrectionInput
	} from '#lib/schemas/attendance.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	type Props = {
		eventId: string;
		/** Called after the correction is saved. */
		onSaved: () => void;
	};

	let { eventId, onSaved }: Props = $props();

	const schema = zod4Client(correctionSchema);
	const form = superForm(
		untrack(() =>
			defaults<CorrectionInput, AttendanceMessage>(
				{ eventId, time: '', remove: false, reason: '' },
				schema,
				{ id: `correct-${eventId}` }
			)
		),
		{ validators: schema, ...statusToasts(() => onSaved()) }
	);
	const { form: formData, enhance, delayed } = form;
</script>

<form method="POST" action="?/correctEvent" class="flex flex-wrap items-start gap-3" use:enhance>
	<input type="hidden" name="eventId" value={$formData.eventId} />

	<Form.Field {form} name="time">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.attendance_new_time()}</Form.Label>
				<Input
					{...props}
					bind:value={$formData.time}
					onblur={() => ($formData.time = normalizeClock($formData.time))}
					class="h-8 w-20 font-mono"
					dir="ltr"
					inputmode="numeric"
					placeholder={m.attendance_time_placeholder()}
					disabled={$formData.remove}
				/>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="remove" class="flex flex-row items-center gap-2 self-center">
		<Form.Control>
			{#snippet children({ props })}
				<Checkbox
					{...props}
					bind:checked={$formData.remove}
					onCheckedChange={(checked) => {
						if (checked) $formData.time = '';
					}}
				/>
				<Form.Label>{m.attendance_remove_event()}</Form.Label>
			{/snippet}
		</Form.Control>
	</Form.Field>

	<Form.Field {form} name="reason" class="min-w-48 flex-1">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.roster_field_reason()}</Form.Label>
				<Input {...props} bind:value={$formData.reason} class="h-8" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Button size="sm" class="self-end" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.attendance_save_correction()}
	</Form.Button>
</form>
