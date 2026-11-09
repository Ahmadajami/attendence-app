<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { earliestEffectiveDate } from '#lib/roster/backdate.js';
	import type { PatternType } from '#lib/schemas/enums.js';
	import {
		resetScheduleSchema,
		staffScheduleFormSchema,
		type PatternMessage
	} from '#lib/schemas/pattern.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide } from '#lib/utils/locale.js';
	import { weekdayNames } from '../roster/labels.js';
	import type { OwnRules } from './types.js';

	type Props = {
		setData: SuperValidated<Infer<typeof staffScheduleFormSchema>, PatternMessage>;
		resetData: SuperValidated<Infer<typeof resetScheduleSchema>, PatternMessage>;
		/** Form actions, e.g. `?/setSchedule` and `?/resetSchedule`. */
		setAction: string;
		resetAction: string;
		staffId: string;
		/** The person's name, for the title. */
		name: string;
		/** The type of the pattern the person follows (`null`: none): weekly → own off days, cycle → crew start. */
		patternType: PatternType | null;
		/** Length of that cycle (crew start choices). */
		cycleLength: number;
		/** The rules in force today. */
		current: OwnRules | null;
		today: string;
		open: boolean;
	};

	let {
		setData,
		resetData,
		setAction,
		resetAction,
		staffId,
		name,
		patternType,
		cycleLength,
		current,
		today,
		open = $bindable()
	}: Props = $props();

	const setForm = superForm(
		untrack(() => setData),
		{
			// `offWeekdays` is an array and may be `null`.
			dataType: 'json',
			validators: zod4Client(staffScheduleFormSchema),
			...statusToasts(() => (open = false))
		}
	);
	const { form: setValues, enhance: setEnhance, delayed: setDelayed } = setForm;

	const resetForm = superForm(
		untrack(() => resetData),
		{
			validators: zod4Client(resetScheduleSchema),
			...statusToasts(() => (open = false))
		}
	);
	const { form: resetValues, enhance: resetEnhance, delayed: resetDelayed } = resetForm;

	// Start from the person's rules in force, so editing one rule keeps the other.
	$effect(() => {
		$setValues.staffId = staffId;
		$setValues.offWeekdays = current?.offWeekdays ? [...current.offWeekdays] : null;
		$setValues.crewStart = current?.crewStart ?? null;
		$resetValues.staffId = staffId;
	});

	const weekdays = $derived(weekdayNames());
	const showOffDays = $derived(patternType !== 'cycle');
	const showCrewStart = $derived(patternType !== 'weekly');
	const crewLabel = (start: number) => m.schedule_crew_start_option({ day: start + 1 });
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.schedule_title({ name })}</Sheet.Title>
			<Sheet.Description>{m.schedule_description()}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action={setAction} class="flex flex-col gap-4 px-4" use:setEnhance>
			{#if showOffDays}
				<Form.Fieldset form={setForm} name="offWeekdays">
					<Form.Legend>{m.schedule_field_off_days()}</Form.Legend>
					<ToggleGroup.Root
						type="multiple"
						variant="outline"
						class="flex-wrap justify-start"
						bind:value={
							() => ($setValues.offWeekdays ?? []).map(String),
							(value) => ($setValues.offWeekdays = value.map(Number))
						}
					>
						{#each weekdays as weekday, index (index)}
							<ToggleGroup.Item value={String(index)}>{weekday}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<Form.Description>{m.schedule_field_off_days_description()}</Form.Description>
					<Form.FieldErrors />
				</Form.Fieldset>
			{/if}

			{#if showCrewStart}
				<Form.Field form={setForm} name="crewStart">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.schedule_field_crew_start()}</Form.Label>
							<Select.Root
								type="single"
								bind:value={
									() => ($setValues.crewStart === null ? '' : String($setValues.crewStart)),
									(value) => ($setValues.crewStart = value === '' ? null : Number(value))
								}
							>
								<Select.Trigger {...props} class="w-full">
									{$setValues.crewStart === null
										? m.schedule_crew_start_placeholder()
										: crewLabel($setValues.crewStart)}
								</Select.Trigger>
								<Select.Content>
									{#each Array.from({ length: Math.max(1, cycleLength) }, (_, i) => i) as start (start)}
										<Select.Item value={String(start)} label={crewLabel(start)} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.Description>{m.schedule_field_crew_start_description()}</Form.Description>
					<Form.FieldErrors />
				</Form.Field>
			{/if}

			<Form.Field form={setForm} name="effectiveFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_effective_from()}</Form.Label>
						<Input
							{...props}
							type="date"
							min={earliestEffectiveDate(today)}
							bind:value={$setValues.effectiveFrom}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={setForm} name="reason">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_reason()}</Form.Label>
						<Textarea {...props} bind:value={$setValues.reason} rows={2} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button class="self-start" disabled={$setDelayed}>
				{#if $setDelayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{m.schedule_save()}
			</Form.Button>
		</form>

		{#if current}
			<Separator class="my-2" />
			<form
				method="POST"
				action={resetAction}
				class="flex flex-col gap-4 px-4 pb-4"
				use:resetEnhance
			>
				<input type="hidden" name="staffId" value={$resetValues.staffId} />
				<p class="text-sm text-muted-foreground">{m.schedule_reset_description()}</p>
				<div class="grid gap-4 sm:grid-cols-2">
					<Form.Field form={resetForm} name="effectiveFrom">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>{m.roster_field_effective_from()}</Form.Label>
								<Input
									{...props}
									type="date"
									min={earliestEffectiveDate(today)}
									bind:value={$resetValues.effectiveFrom}
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Form.Field form={resetForm} name="reason">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>{m.roster_field_reason()}</Form.Label>
								<Input {...props} bind:value={$resetValues.reason} />
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<Form.Button variant="outline" class="self-start" disabled={$resetDelayed}>
					{#if $resetDelayed}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					{m.schedule_reset()}
				</Form.Button>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
