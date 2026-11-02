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
	import * as Select from '#lib/components/ui/select/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import {
		addPairSchema,
		type AddPairInput,
		type AttendanceMessage
	} from '#lib/schemas/attendance.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName } from '#lib/utils/locale.js';

	type Props = {
		staffId: string;
		shiftDate: string;
		/** The planned shift of the day (`null`: off), preselected; a reason is needed for another. */
		plannedShiftId: string | null;
		/** Active shifts to choose from. */
		shifts: Pick<RosterShift, 'id' | 'code' | 'nameEn' | 'nameAr'>[];
		/** Called after the pair is saved. */
		onSaved: () => void;
		/** Called on Cancel: the panel closes the form; typed values are dropped. */
		onCancel: () => void;
	};

	let { staffId, shiftDate, plannedShiftId, shifts, onSaved, onCancel }: Props = $props();

	const schema = zod4Client(addPairSchema);
	const form = superForm(
		untrack(() =>
			defaults<AddPairInput, AttendanceMessage>(
				{
					staffId,
					shiftDate,
					shiftId: plannedShiftId ?? shifts[0]?.id ?? '',
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

	const shiftLabel = (id: string) => {
		const shift = shifts.find((s) => s.id === id);
		return shift ? `${shift.code} · ${lookupName(shift)}` : m.attendance_pick_shift();
	};
</script>

<form method="POST" action="?/addPair" class="flex flex-wrap items-start gap-3" use:enhance>
	<input type="hidden" name="staffId" value={$formData.staffId} />
	<input type="hidden" name="shiftDate" value={$formData.shiftDate} />

	<Form.Field {form} name="shiftId">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.attendance_col_shift()}</Form.Label>
				<Select.Root type="single" name={props.name} bind:value={$formData.shiftId}>
					<Select.Trigger {...props} class="h-8 w-44">
						{shiftLabel($formData.shiftId)}
					</Select.Trigger>
					<Select.Content>
						{#each shifts as option (option.id)}
							<Select.Item value={option.id} label={shiftLabel(option.id)} />
						{/each}
					</Select.Content>
				</Select.Root>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

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
					placeholder={$formData.shiftId === plannedShiftId
						? m.attendance_reason_optional()
						: m.attendance_reason_required()}
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
