<script lang="ts">
	import { untrack } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		swapDecisionSchema,
		type SwapDecisionInput,
		type SwapMessage
	} from '#lib/schemas/swap.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	// Approve a pending swap (optional note) or reject it (note required), swaps plan SW4, SW5. The
	// detail sheet remounts it for each request and decision.

	type Props = {
		id: string;
		decision: 'approve' | 'reject';
		action: string;
		onSaved: () => void;
	};

	let { id, decision, action, onSaved }: Props = $props();

	const schema = zod4Client(swapDecisionSchema);
	const form = superForm(
		untrack(() =>
			defaults<SwapDecisionInput, SwapMessage>({ id, decision, note: '' }, schema, {
				id: 'swap-decision'
			})
		),
		{ validators: schema, ...statusToasts(() => onSaved()) }
	);
	const { form: formData, enhance, delayed } = form;
</script>

<form method="POST" {action} class="flex flex-col gap-3" use:enhance>
	<input type="hidden" name="id" value={$formData.id} />
	<input type="hidden" name="decision" value={$formData.decision} />

	<Form.Field {form} name="note">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.swap_field_note()}</Form.Label>
				<Textarea {...props} bind:value={$formData.note} rows={2} />
			{/snippet}
		</Form.Control>
		<Form.Description>
			{decision === 'reject' ? m.swap_note_hint_reject() : m.swap_note_hint_approve()}
		</Form.Description>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Button
		class="self-start"
		variant={decision === 'reject' ? 'destructive' : 'default'}
		disabled={$delayed}
	>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{decision === 'reject' ? m.swap_reject() : m.swap_approve()}
	</Form.Button>
</form>
