<script lang="ts">
	import { untrack } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { normalizeClock } from '#lib/attendance/entry.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		addPairSchema,
		type AddPairInput,
		type AttendanceMessage
	} from '#lib/schemas/attendance.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	// A new check-in / check-out on a date. No shift: the roster's plan for the day decides how it
	// counts (plan PS1–PS3); the reason is an optional note (PS4).
	type Props = {
		staffId: string;
		shiftDate: string;
		/** Called after the pair is saved. */
		onSaved: () => void;
		/** Called on Cancel: the panel closes the form; typed values are dropped. */
		onCancel: () => void;
	};

	let { staffId, shiftDate, onSaved, onCancel }: Props = $props();

	const schema = zod4Client(addPairSchema);
	const form = superForm(
		untrack(() =>
			defaults<AddPairInput, AttendanceMessage>(
				{
					staffId,
					shiftDate,
					checkIn: '',
					checkOut: '',
					reason: ''
				},
				schema,
				{ id: `add-pair-${shiftDate}` }
			)
		),
		{ validators: schema, ...statusToasts(() => onSaved()) }
	);
	const { form: formData, enhance, delayed } = form;
</script>

<form method="POST" action="?/addPair" class="flex flex-wrap items-start gap-3" use:enhance>
	<input type="hidden" name="staffId" value={$formData.staffId} />
	<input type="hidden" name="shiftDate" value={$formData.shiftDate} />

	<Form.Field {form} name="checkIn">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.attendance_col_in()}</Form.Label>
				<Input
					{...props}
					bind:value={$formData.checkIn}
					onblur={() => ($formData.checkIn = normalizeClock($formData.checkIn))}
					class="h-8 w-20 font-mono"
					dir="ltr"
					inputmode="numeric"
					placeholder={m.attendance_time_placeholder()}
				/>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="checkOut">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.attendance_col_out()}</Form.Label>
				<Input
					{...props}
					bind:value={$formData.checkOut}
					onblur={() => ($formData.checkOut = normalizeClock($formData.checkOut))}
					class="h-8 w-20 font-mono"
					dir="ltr"
					inputmode="numeric"
					placeholder={m.attendance_time_placeholder()}
				/>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="reason" class="min-w-48 flex-1">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.roster_field_reason()}</Form.Label>
				<Input
					{...props}
					bind:value={$formData.reason}
					class="h-8"
					placeholder={m.attendance_reason_optional()}
				/>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Button size="sm" class="self-end" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.attendance_save()}
	</Form.Button>
	<Button type="button" variant="ghost" size="sm" class="self-end" onclick={onCancel}>
		<XIcon data-icon="inline-start" />
		{m.attendance_cancel()}
	</Button>
</form>
