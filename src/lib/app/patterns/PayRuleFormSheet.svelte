<script lang="ts">
	import { untrack } from 'svelte';
	import { numberProxy, superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PayRule } from '#lib/payroll/pay-rule.js';
	import {
		OT_CHOICES,
		payRuleFormSchema,
		type OtChoice,
		type PatternPayMessage
	} from '#lib/schemas/pattern-pay.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof payRuleFormSchema>, PatternPayMessage>;
		/** What an empty value falls back to (the company setting, or the built-in default). */
		inherited: PayRule;
		/** Where that comes from, e.g. "Company setting". */
		inheritLabel: string;
		today: string;
		open: boolean;
	};

	let { data, inherited, inheritLabel, today, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(payRuleFormSchema),
			// Several forms share the page: after a save the sheet starts from the reloaded
			// rule in force, not from the values it was created with.
			invalidateAll: 'pessimistic',
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	// A cleared rate posts nothing and means "inherit" (`null`).
	const workDayRate = numberProxy(form, 'workDayRate', { empty: 'null' });
	const offDayRate = numberProxy(form, 'offDayRate', { empty: 'null' });
	const holidayRate = numberProxy(form, 'holidayRate', { empty: 'null' });

	const otLabel: Record<OtChoice, () => string> = {
		inherit: () =>
			`${inheritLabel} (${inherited.otEnabled ? m.pattern_pay_on() : m.pattern_pay_off()})`,
		on: m.pattern_pay_on,
		off: m.pattern_pay_off
	};

	const hint = (rate: number) =>
		m.pattern_pay_rate_hint({ source: inheritLabel, rate: rate.toFixed(2) });
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.pattern_pay_sheet_title()}</Sheet.Title>
			<Sheet.Description>{m.pattern_pay_sheet_description()}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/setPayRule" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="patternId" value={$formData.patternId} />

			<Form.Field {form} name="otEnabled">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.pattern_pay_overtime()}</Form.Label>
						<Select.Root type="single" name={props.name} bind:value={$formData.otEnabled}>
							<Select.Trigger {...props} class="w-full">
								{otLabel[$formData.otEnabled]()}
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

			<div class="grid gap-4 sm:grid-cols-3">
				<Form.Field {form} name="workDayRate">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_pay_work_day()}</Form.Label>
							<Input
								{...props}
								bind:value={$workDayRate}
								inputmode="decimal"
								dir="ltr"
								class="font-mono"
								placeholder={inherited.workDayRate.toFixed(2)}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>
						{hint(inherited.workDayRate)}
					</Form.Description>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="offDayRate">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_pay_off_day()}</Form.Label>
							<Input
								{...props}
								bind:value={$offDayRate}
								inputmode="decimal"
								dir="ltr"
								class="font-mono"
								placeholder={inherited.offDayRate.toFixed(2)}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>
						{hint(inherited.offDayRate)}
					</Form.Description>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="holidayRate">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_pay_holiday()}</Form.Label>
							<Input
								{...props}
								bind:value={$holidayRate}
								inputmode="decimal"
								dir="ltr"
								class="font-mono"
								placeholder={inherited.holidayRate.toFixed(2)}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>
						{hint(inherited.holidayRate)}
					</Form.Description>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<Form.Field {form} name="effectiveFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_effective_from()}</Form.Label>
						<Input {...props} type="date" min={today} bind:value={$formData.effectiveFrom} />
					{/snippet}
				</Form.Control>
				<Form.Description>{m.pattern_pay_from_hint()}</Form.Description>
				<Form.FieldErrors />
			</Form.Field>

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
				{m.pattern_pay_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
