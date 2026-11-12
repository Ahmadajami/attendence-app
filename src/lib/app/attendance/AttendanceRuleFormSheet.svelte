<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { earliestEffectiveDate } from '#lib/roster/backdate.js';
	import {
		attendanceRuleFormSchema,
		ROUNDING_MODE_CHOICES,
		ROUNDING_STEP_CHOICES,
		type AttendanceRuleFormSchema
	} from '#lib/schemas/attendance-rules.schema.js';
	import type { StatusMessage } from '#lib/utils/form-toasts.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide } from '#lib/utils/locale.js';
	import { MODE_LABEL, STEP_LABEL } from './attendance-rule-labels.js';

	type Props = {
		data: SuperValidated<Infer<AttendanceRuleFormSchema>, StatusMessage>;
		today: string;
		open: boolean;
	};

	let { data, today, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(attendanceRuleFormSchema),
			// The page's other forms share the load: after a save the sheet reloads the rules in force.
			invalidateAll: 'pessimistic',
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.attendance_rules_sheet_title()}</Sheet.Title>
			<Sheet.Description>{m.attendance_rules_add_description()}</Sheet.Description>
		</Sheet.Header>

		<form
			method="POST"
			action="?/setAttendanceRule"
			class="flex flex-col gap-4 px-4 pb-4"
			use:enhance
		>
			<Form.Field {form} name="effectiveFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.attendance_rules_field_from()}</Form.Label>
						<Input
							{...props}
							type="date"
							min={earliestEffectiveDate(today)}
							bind:value={$formData.effectiveFrom}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="overtimeStep">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.attendance_rules_field_step()}</Form.Label>
						<Select.Root type="single" name={props.name} bind:value={$formData.overtimeStep}>
							<Select.Trigger {...props} class="w-full">
								{STEP_LABEL(Number($formData.overtimeStep))}
							</Select.Trigger>
							<Select.Content>
								{#each ROUNDING_STEP_CHOICES as step (step)}
									<Select.Item value={step} label={STEP_LABEL(Number(step))} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="overtimeMode">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.attendance_rules_field_mode()}</Form.Label>
						<Select.Root type="single" name={props.name} bind:value={$formData.overtimeMode}>
							<Select.Trigger {...props} class="w-full">
								{MODE_LABEL[$formData.overtimeMode]()}
							</Select.Trigger>
							<Select.Content>
								{#each ROUNDING_MODE_CHOICES as mode (mode)}
									<Select.Item value={mode} label={MODE_LABEL[mode]()} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="fridayPrayerOn" class="flex flex-col gap-2">
				<Form.Control>
					{#snippet children({ props })}
						<div class="flex items-center gap-2">
							<Switch {...props} bind:checked={$formData.fridayPrayerOn} />
							<Form.Label>{m.attendance_rules_field_prayer_on()}</Form.Label>
						</div>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="fridayPrayerMinutes">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.attendance_rules_field_prayer_minutes()}</Form.Label>
							<Input
								{...props}
								type="number"
								min="0"
								max="240"
								step="1"
								dir="ltr"
								class="font-mono"
								bind:value={$formData.fridayPrayerMinutes}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="fridayPrayerSegments">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.attendance_rules_field_prayer_segments()}</Form.Label>
							<Input
								{...props}
								type="number"
								min="1"
								max="10"
								step="1"
								dir="ltr"
								class="font-mono"
								bind:value={$formData.fridayPrayerSegments}
							/>
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

			<Form.Button class="self-start" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{m.attendance_rules_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
