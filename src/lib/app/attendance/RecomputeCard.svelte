<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { AttendanceMessage } from '#lib/schemas/attendance.schema.js';
	import { recomputeFromSchema, type RecomputeFromInput } from '#lib/schemas/day-results.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	type Props = {
		data: SuperValidated<RecomputeFromInput, AttendanceMessage>;
		/** The latest date allowed (today). */
		today: string;
		/** The longest range, in days. */
		maxDays: number;
	};

	let { data, today, maxDays }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(recomputeFromSchema),
			// Several forms share the daily page: the load data wins after the run, which also
			// reloads the rows it rewrote.
			invalidateAll: 'pessimistic',
			...statusToasts()
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<!-- "Recompute from a date" (pay plan 3.3), at the bottom of the daily attendance page (5.2). -->
<Card.Root>
	<Card.Header>
		<Card.Title>{m.daily_recompute_title()}</Card.Title>
		<Card.Description>{m.daily_recompute_description({ max: maxDays })}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/recompute" class="flex flex-wrap items-start gap-3" use:enhance>
			<Form.Field {form} name="from">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.daily_recompute_from()}</Form.Label>
						<Input {...props} type="date" bind:value={$formData.from} max={today} class="w-44" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Button class="self-end" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{:else}
					<ArrowsClockwiseIcon data-icon="inline-start" />
				{/if}
				{m.daily_recompute_button()}
			</Form.Button>
		</form>
	</Card.Content>
</Card.Root>
