<script lang="ts">
	import { untrack } from 'svelte';
	import { fieldProxy, superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { holidayCancelSchema, type PatternPayMessage } from '#lib/schemas/pattern-pay.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide, lookupName } from '#lib/utils/locale.js';
	import { formatDateRange } from './pay-labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof holidayCancelSchema>, PatternPayMessage>;
		/** The holiday to cancel; `null` while the sheet is closed. */
		holiday: {
			id: string;
			nameEn: string;
			nameAr: string;
			startsOn: string;
			endsOn: string;
		} | null;
		open: boolean;
	};

	let { data, holiday, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(holidayCancelSchema),
			// Several forms share the page: the load data wins after a save.
			invalidateAll: 'pessimistic',
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	// Filled when the sheet opens for a holiday: not user edits, so they don't taint the form.
	const holidayId = fieldProxy(form, 'holidayId', { taint: false });
	const reason = fieldProxy(form, 'reason', { taint: false });

	$effect(() => {
		if (!open || !holiday) return;
		const id = holiday.id;
		untrack(() => {
			holidayId.set(id);
			reason.set('');
		});
	});
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()}>
		<Sheet.Header>
			<Sheet.Title>{m.pattern_holiday_cancel_title()}</Sheet.Title>
			<Sheet.Description>
				{holiday
					? m.pattern_holiday_cancel_description({
							name: lookupName(holiday),
							dates: formatDateRange(holiday.startsOn, holiday.endsOn)
						})
					: ''}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/cancelHoliday" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="holidayId" value={$formData.holidayId} />

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
				{m.pattern_holiday_cancel_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
