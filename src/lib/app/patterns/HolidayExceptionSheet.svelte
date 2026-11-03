<script lang="ts">
	import { untrack } from 'svelte';
	import { fieldProxy, superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		holidayExceptionSchema,
		OT_CHOICES,
		type OtChoice,
		type PatternPayMessage
	} from '#lib/schemas/pattern-pay.schema.js';
	import type { CompanyHolidayForPattern } from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide, lookupName } from '#lib/utils/locale.js';
	import { formatDateRange } from './pay-labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof holidayExceptionSchema>, PatternPayMessage>;
		/** The company holiday; `null` while the sheet is closed. */
		holiday: CompanyHolidayForPattern | null;
		open: boolean;
	};

	let { data, holiday, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(holidayExceptionSchema),
			// Several forms share the pattern page: the load data wins after a save.
			invalidateAll: 'pessimistic',
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	// Filled when the sheet opens for a holiday (its current exception): not user edits, so they
	// don't taint the form.
	const holidayId = fieldProxy(form, 'holidayId', { taint: false });
	const applies = fieldProxy(form, 'applies', { taint: false });
	const otEligible = fieldProxy(form, 'otEligible', { taint: false });
	const reason = fieldProxy(form, 'reason', { taint: false });

	$effect(() => {
		if (!open || !holiday) return;
		const id = holiday.id;
		const exception = holiday.exception;
		untrack(() => {
			holidayId.set(id);
			applies.set(exception?.applies ?? true);
			otEligible.set(
				exception?.otEligible == null ? 'inherit' : exception.otEligible ? 'on' : 'off'
			);
			reason.set('');
		});
	});

	const eligibleText = (value: boolean) =>
		value ? m.pattern_holiday_eligible() : m.pattern_holiday_not_eligible();

	const otLabel: Record<OtChoice, () => string> = {
		inherit: () =>
			m.pattern_exception_ot_inherit({ value: eligibleText(holiday?.otEligible ?? false) }),
		on: m.pattern_holiday_eligible,
		off: m.pattern_holiday_not_eligible
	};
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()}>
		<Sheet.Header>
			<Sheet.Title>
				{holiday ? m.pattern_exception_title({ name: lookupName(holiday) }) : ''}
			</Sheet.Title>
			<Sheet.Description>
				{holiday
					? m.pattern_exception_description({
							dates: formatDateRange(holiday.startsOn, holiday.endsOn)
						})
					: ''}
			</Sheet.Description>
		</Sheet.Header>

		<form
			method="POST"
			action="?/setHolidayException"
			class="flex flex-col gap-4 px-4 pb-4"
			use:enhance
		>
			<input type="hidden" name="patternId" value={$formData.patternId} />
			<input type="hidden" name="holidayId" value={$formData.holidayId} />

			<Form.Field {form} name="applies">
				<Form.Control>
					{#snippet children({ props })}
						<div class="flex items-center gap-2">
							<Switch {...props} bind:checked={$formData.applies} />
							<Form.Label>{m.pattern_exception_field_applies()}</Form.Label>
						</div>
					{/snippet}
				</Form.Control>
			</Form.Field>

			{#if $formData.applies}
				<Form.Field {form} name="otEligible">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_pay_overtime()}</Form.Label>
							<Select.Root type="single" name={props.name} bind:value={$formData.otEligible}>
								<Select.Trigger {...props} class="w-full">
									{otLabel[$formData.otEligible]()}
								</Select.Trigger>
								<Select.Content>
									{#each OT_CHOICES as choice (choice)}
										<Select.Item value={choice} label={otLabel[choice]()} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			{:else}
				<!-- A skipped holiday keeps no overtime switch of its own. -->
				<input type="hidden" name="otEligible" value="inherit" />
			{/if}

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
				{m.pattern_exception_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
