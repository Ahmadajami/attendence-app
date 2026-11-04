<script lang="ts">
	import { untrack } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		swapCancelSchema,
		type SwapCancelInput,
		type SwapMessage
	} from '#lib/schemas/swap.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';

	// Withdraw a pending swap, or undo an approved one with its one-off shifts (swaps plan SW5). A
	// reason is required.

	type Props = {
		id: string;
		/** Approved: cancelling puts the roster back. */
		applied: boolean;
		action: string;
		onSaved: () => void;
	};

	let { id, applied, action, onSaved }: Props = $props();

	const schema = zod4Client(swapCancelSchema);
	const form = superForm(
		untrack(() =>
			defaults<SwapCancelInput, SwapMessage>({ id, reason: '' }, schema, { id: 'swap-cancel' })
		),
		{ validators: schema, ...statusToasts(() => onSaved()) }
	);
	const { form: formData, enhance, delayed } = form;
</script>

<form method="POST" {action} class="flex flex-col gap-3" use:enhance>
	<input type="hidden" name="id" value={$formData.id} />
	<p class="text-sm text-muted-foreground">
		{applied ? m.swap_cancel_hint_approved() : m.swap_cancel_hint_pending()}
	</p>

	<Form.Field {form} name="reason">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.roster_field_reason()}</Form.Label>
				<Textarea {...props} bind:value={$formData.reason} rows={2} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Button class="self-start" variant="destructive" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{applied ? m.swap_cancel() : m.swap_withdraw()}
	</Form.Button>
</form>
