<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { holidayFormSchema, type PatternPayMessage } from '#lib/schemas/pattern-pay.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof holidayFormSchema>, PatternPayMessage>;
		open: boolean;
	};

	let { data, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(holidayFormSchema),
			// Several forms share the page: the load data wins after a save.
			invalidateAll: 'pessimistic',
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.pattern_holiday_sheet_title()}</Sheet.Title>
			<Sheet.Description>{m.pattern_holiday_sheet_description()}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/addHoliday" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="patternId" value={$formData.patternId} />

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="nameEn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_holiday_field_name_en()}</Form.Label>
							<Input {...props} bind:value={$formData.nameEn} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="nameAr">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_holiday_field_name_ar()}</Form.Label>
							<Input {...props} bind:value={$formData.nameAr} dir="rtl" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="startsOn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_field_starts()}</Form.Label>
							<Input {...props} type="date" bind:value={$formData.startsOn} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="endsOn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.pattern_field_ends()}</Form.Label>
							<Input
								{...props}
								type="date"
								min={$formData.startsOn}
								bind:value={$formData.endsOn}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<Form.Field {form} name="otEligible" class="flex flex-col gap-2">
				<Form.Control>
					{#snippet children({ props })}
						<div class="flex items-center gap-2">
							<Switch {...props} bind:checked={$formData.otEligible} />
							<Form.Label>{m.pattern_holiday_eligible()}</Form.Label>
						</div>
					{/snippet}
				</Form.Control>
				<Form.Description>{m.pattern_holiday_field_ot_hint()}</Form.Description>
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
				{m.pattern_holiday_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
