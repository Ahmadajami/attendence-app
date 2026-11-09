<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { earliestEffectiveDate } from '#lib/roster/backdate.js';
	import { endAssignmentSchema, type PatternMessage } from '#lib/schemas/pattern.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof endAssignmentSchema>, PatternMessage>;
		/** Form action, e.g. `?/endAssignment`. The target is the page's. */
		action: string;
		today: string;
		title: string;
		description: string;
		open: boolean;
	};

	let { data, action, today, title, description, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(endAssignmentSchema),
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()}>
		<Sheet.Header>
			<Sheet.Title>{title}</Sheet.Title>
			<Sheet.Description>{description}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" {action} class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="targetKind" value={$formData.targetKind} />
			<input type="hidden" name="targetId" value={$formData.targetId} />

			<Form.Field {form} name="effectiveFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_effective_from()}</Form.Label>
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

			<Form.Field {form} name="reason">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_reason()}</Form.Label>
						<Textarea {...props} bind:value={$formData.reason} rows={2} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button variant="outline" class="self-start" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{m.assign_end_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
