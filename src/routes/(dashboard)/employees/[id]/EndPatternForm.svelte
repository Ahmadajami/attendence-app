<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		endPatternFormSchema,
		type EndPatternFormSchema,
		type RosterMessage
	} from '#lib/schemas/roster.schema.js';

	type Props = {
		data: SuperValidated<Infer<EndPatternFormSchema>, RosterMessage>;
		today: string;
	};

	let { data, today }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(endPatternFormSchema),
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') toast.success(form.message.text);
				else if (form.message?.kind === 'error') toast.error(form.message.text);
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<form method="POST" action="?/endPattern" class="flex flex-col gap-4" use:enhance>
	<div class="grid gap-4 sm:grid-cols-2">
		<Form.Field {form} name="effectiveFrom">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.roster_field_end_from()}</Form.Label>
					<Input {...props} type="date" min={today} bind:value={$formData.effectiveFrom} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="reason">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.roster_field_reason()}</Form.Label>
					<Textarea {...props} bind:value={$formData.reason} rows={1} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	</div>

	<Form.Button variant="outline" class="self-start" disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{m.roster_end_pattern()}
	</Form.Button>
</form>
