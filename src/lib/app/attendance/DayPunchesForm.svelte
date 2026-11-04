<script lang="ts">
	import { untrack } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import ClockIcon from 'phosphor-svelte/lib/ClockIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { normalizeClock } from '#lib/attendance/entry.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		dayPunchesSchema,
		type AttendanceMessage,
		type DayPunchesInput
	} from '#lib/schemas/attendance.schema.js';
	import type { DayPunches } from '#lib/server/services/attendance/attendance.bl.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName } from '#lib/utils/locale.js';

	// The day editor's check-in / out (pay plan PR46–PR48): starts from the day's recorded pair (or
	// empty), "Fill shift times" writes the shift's start and end into the boxes, every box stays
	// editable, and a reason is required. The service adds or corrects; the originals stay.

	type Props = {
		/** The day's punches, loaded when the sheet opened on it (one pair at most). */
		day: DayPunches;
		staffId: string;
		date: string;
		action: string;
		onSaved: () => void;
	};

	let { day, staffId, date, action, onSaved }: Props = $props();

	const pair = $derived(day.pairs[0] ?? null);

	const schema = zod4Client(dayPunchesSchema);
	// Seeded from the recorded pair (the sheet remounts this form for each person and day).
	const form = superForm(
		untrack(() => {
			const recorded = day.pairs[0] ?? null;
			return defaults<DayPunchesInput, AttendanceMessage>(
				{
					staffId,
					shiftDate: date,
					shiftId:
						recorded?.shiftId ?? day.plannedShiftId ?? day.shifts.find((s) => s.active)?.id ?? '',
					checkIn: recorded?.checkIn ?? '',
					checkOut: recorded?.checkOut ?? '',
					reason: ''
				},
				schema,
				{ id: 'day-punches' }
			);
		}),
		{ validators: schema, ...statusToasts(() => onSaved()) }
	);
	const { form: formData, enhance, delayed } = form;

	const shiftOf = (id: string) => day.shifts.find((s) => s.id === id);
	const clock = (time: string) => time.slice(0, 5);
	const shiftLabel = (id: string) => {
		const shift = shiftOf(id);
		return shift
			? `${shift.code} · ${lookupName(shift)} · ${clock(shift.startTime)}–${clock(shift.endTime)}`
			: m.attendance_pick_shift();
	};
	/** New shifts only from the active ones; the planned one even when inactive. */
	const choices = $derived(day.shifts.filter((s) => s.active || s.id === day.plannedShiftId));
	const fillable = $derived(shiftOf($formData.shiftId));

	/** The shift's start and end into the boxes; both stay editable. */
	function fill() {
		if (!fillable) return;
		$formData.checkIn = clock(fillable.startTime);
		$formData.checkOut = clock(fillable.endTime);
	}
</script>

<form method="POST" {action} class="flex flex-col gap-4" use:enhance>
	<input type="hidden" name="staffId" value={$formData.staffId} />
	<input type="hidden" name="shiftDate" value={$formData.shiftDate} />

	<p class="text-sm">
		{#if pair}
			<bdi>
				{m.day_punches_recorded({
					checkIn: pair.checkIn ?? '—',
					checkOut: pair.checkOut ?? '—'
				})}
			</bdi>
		{:else}
			{m.day_punches_none()}
		{/if}
	</p>

	{#if pair}
		<!-- A recorded pair keeps its shift: corrections never move it. -->
		<input type="hidden" name="shiftId" value={$formData.shiftId} />
		<p class="text-sm text-muted-foreground">
			{m.day_punches_shift_fixed({ shift: shiftLabel($formData.shiftId) })}
		</p>
	{:else}
		<Form.Field {form} name="shiftId">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.attendance_col_shift()}</Form.Label>
					<Select.Root type="single" name={props.name} bind:value={$formData.shiftId}>
						<Select.Trigger {...props} class="w-full">
							{shiftLabel($formData.shiftId)}
						</Select.Trigger>
						<Select.Content>
							{#each choices as option (option.id)}
								<Select.Item value={option.id} label={shiftLabel(option.id)} />
							{/each}
						</Select.Content>
					</Select.Root>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	{/if}

	<div class="flex flex-wrap items-start gap-3">
		<Form.Field {form} name="checkIn">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.attendance_col_in()}</Form.Label>
					<Input
						{...props}
						bind:value={$formData.checkIn}
						onblur={() => ($formData.checkIn = normalizeClock($formData.checkIn))}
						class="w-24 font-mono"
						dir="ltr"
						inputmode="numeric"
						autocomplete="off"
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
						class="w-24 font-mono"
						dir="ltr"
						inputmode="numeric"
						autocomplete="off"
						placeholder={m.attendance_time_placeholder()}
					/>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Button type="button" variant="outline" class="mt-6" disabled={!fillable} onclick={fill}>
			<ClockIcon data-icon="inline-start" />
			{m.day_punches_fill()}
		</Button>
	</div>

	<Form.Field {form} name="reason">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.roster_field_reason()}</Form.Label>
				<Textarea {...props} bind:value={$formData.reason} rows={2} />
			{/snippet}
		</Form.Control>
		<Form.Description>{m.day_punches_reason_hint()}</Form.Description>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Button class="self-start" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.day_punches_submit()}
	</Form.Button>
</form>
