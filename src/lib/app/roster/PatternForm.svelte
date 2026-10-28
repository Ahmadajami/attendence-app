<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterPattern } from '#lib/roster/roster.js';
	import type { ShiftKind } from '#lib/schemas/enums.js';
	import {
		patternFormSchema,
		type PatternFormSchema,
		type RosterMessage
	} from '#lib/schemas/roster.schema.js';
	import type { ShiftStarts } from '#lib/schemas/settings.schema.js';
	import CycleEditor from './CycleEditor.svelte';
	import { formatWallClock, shiftKindLetter } from './labels.js';
	import { draftVersion } from './preview.js';

	type CopySource = { id: string; label: string; cycle: ShiftKind[] };

	type Props = {
		data: SuperValidated<Infer<PatternFormSchema>, RosterMessage>;
		/** Form action, e.g. `?/savePattern`. */
		action: string;
		shiftStarts: ShiftStarts | null;
		/** Damascus today: the earliest effective date. */
		today: string;
		/** Saved cycles to start from. */
		copySources?: CopySource[];
		/** Renders the live preview of the version being edited (`null` while incomplete). */
		preview: Snippet<[RosterPattern | null]>;
	};

	let { data, action, shiftStarts, today, copySources = [], preview }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(patternFormSchema),
			resetForm: false,
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') toast.success(form.message.text);
				else if (form.message?.kind === 'error') toast.error(form.message.text);
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed } = form;

	const draft = $derived(draftVersion($formData, shiftStarts, null));
	const disabled = $derived(shiftStarts === null);
</script>

<div class="flex flex-col gap-6">
	{#if shiftStarts === null}
		<p class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{m.roster_times_unset()}
			<a href={localizedHref('/admin/settings')} class="font-medium underline">
				{m.roster_times_unset_link()}
			</a>
		</p>
	{:else}
		<p class="text-sm text-muted-foreground">
			{m.roster_times_summary({
				day: formatWallClock(shiftStarts.day),
				night: formatWallClock(shiftStarts.night)
			})}
		</p>
	{/if}

	<form method="POST" {action} class="flex flex-col gap-4" use:enhance>
		<Form.Fieldset {form} name="cycle">
			<Form.Legend>{m.roster_field_cycle()}</Form.Legend>
			<CycleEditor bind:value={$formData.cycle} {disabled} />
			{#each $formData.cycle as kind, index (index)}
				<input type="hidden" name="cycle" value={kind} />
			{/each}
			<Form.FieldErrors />
		</Form.Fieldset>

		{#if copySources.length > 0}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm" class="self-start" {disabled}>
							<CopyIcon data-icon="inline-start" />
							{m.roster_copy_from()}
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start">
					{#each copySources as source (source.id)}
						<DropdownMenu.Item onSelect={() => ($formData.cycle = [...source.cycle])}>
							<span class="flex-1">{source.label}</span>
							<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
								{source.cycle.map(shiftKindLetter).join(' ')}
							</bdi>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field {form} name="anchorDate">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_anchor()}</Form.Label>
						<Input {...props} type="date" bind:value={$formData.anchorDate} {disabled} />
					{/snippet}
				</Form.Control>
				<Form.Description>{m.roster_field_anchor_description()}</Form.Description>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="effectiveFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_effective_from()}</Form.Label>
						<Input
							{...props}
							type="date"
							min={today}
							bind:value={$formData.effectiveFrom}
							{disabled}
						/>
					{/snippet}
				</Form.Control>
				<Form.Description>{m.roster_field_effective_from_description()}</Form.Description>
				<Form.FieldErrors />
			</Form.Field>
		</div>

		<Form.Field {form} name="reason">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.roster_field_reason()}</Form.Label>
					<Textarea {...props} bind:value={$formData.reason} rows={2} {disabled} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Button class="self-start" disabled={disabled || $delayed}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{m.roster_save_pattern()}
		</Form.Button>
	</form>

	{@render preview(draft)}
</div>
