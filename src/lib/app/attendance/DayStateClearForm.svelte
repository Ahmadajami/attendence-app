<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { AttendanceMessage } from '#lib/schemas/attendance.schema.js';
	import { dayStateClearSchema } from '#lib/schemas/day-state.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	// Clear every state of a person over a date range (pay plan PR19): the days follow the roster
	// again. The day editor sheet fills the person and the day it opened on.

	type Props = {
		data: SuperValidated<Infer<typeof dayStateClearSchema>, AttendanceMessage>;
		staffId: string;
		date: string;
		action: string;
		onSaved: () => void;
	};

	let { data, staffId, date, action, onSaved }: Props = $props();

	// Seeded with the person and the day the sheet opened on (the sheet remounts this form for each
	// day), so the dates start there without an edit.
	const form = superForm(
		untrack(() => ({
			...data,
			data: { ...data.data, staffId, startsOn: date, endsOn: date, reason: '' }
		})),
		{
			validators: zod4Client(dayStateClearSchema),
			// Several forms share the page: the load data wins after a save.
			invalidateAll: 'pessimistic',
			...statusToasts(() => onSaved())
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<form method="POST" {action} class="flex flex-col gap-4" use:enhance>
	<input type="hidden" name="staffId" value={$formData.staffId} />

	<div class="grid grid-cols-2 gap-3">
		<Form.Field {form} name="startsOn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.day_state_field_from()}</Form.Label>
					<Input {...props} type="date" bind:value={$formData.startsOn} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field {form} name="endsOn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.day_state_field_to()}</Form.Label>
					<Input {...props} type="date" bind:value={$formData.endsOn} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	</div>

	<Form.Field {form} name="reason">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.roster_field_reason()}</Form.Label>
				<Textarea {...props} bind:value={$formData.reason} rows={2} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Button variant="destructive" class="self-start" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.day_state_clear_submit()}
	</Form.Button>
</form>
