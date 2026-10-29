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
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { WEEKLY_SLOTS } from '#lib/payroll/schedule.js';
	import type { RosterAssignment } from '#lib/roster/roster.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { PatternType } from '#lib/schemas/enums.js';
	import {
		patternFormSchema,
		type PatternFormSchema,
		type RosterMessage
	} from '#lib/schemas/roster.schema.js';
	import CycleEditor from './CycleEditor.svelte';
	import { shiftsById, slotCodes } from './labels.js';
	import { draftVersion } from './preview.js';

	type CopySource = { id: string; label: string; type: PatternType; slots: (string | null)[] };

	type Props = {
		data: SuperValidated<Infer<PatternFormSchema>, RosterMessage>;
		/** Form action, e.g. `?/savePattern`. */
		action: string;
		/** Every shift (the editor's palette is the active ones). */
		shifts: Pick<
			RosterShift,
			'id' | 'code' | 'nameEn' | 'nameAr' | 'colour' | 'startTime' | 'endTime' | 'active'
		>[];
		/** Damascus today: the earliest effective date. */
		today: string;
		/** Saved patterns to start from. */
		copySources?: CopySource[];
		/** Renders the live preview of the version being edited (`null` while incomplete). */
		preview: Snippet<[RosterAssignment | null]>;
	};

	let { data, action, shifts, today, copySources = [], preview }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			// `null` slots (off) don't survive form encoding.
			dataType: 'json',
			validators: zod4Client(patternFormSchema),
			resetForm: false,
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') toast.success(form.message.text);
				else if (form.message?.kind === 'error') toast.error(form.message.text);
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed, tainted, isTainted } = form;

	// Only an edited form previews as a new version: the untouched defaults (today's version from
	// today) would otherwise hide scheduled versions.
	const draft = $derived(isTainted($tainted) ? draftVersion($formData, null) : null);
	const byId = $derived(shiftsById(shifts));

	/**
	 * A weekly pattern always has 7 slots (Sunday first). Clicking the selected toggle deselects it
	 * inside bits-ui (`''`); that is ignored, and the binding reads the form's type back.
	 */
	function setType(type: PatternType | '') {
		if (!type || type === $formData.type) return;
		$formData.type = type;
		if (type === 'weekly')
			$formData.slots = Array.from({ length: WEEKLY_SLOTS }, (_, i) => $formData.slots[i] ?? null);
	}
</script>

<div class="flex flex-col gap-6">
	<form method="POST" {action} class="flex flex-col gap-4" use:enhance>
		<Form.Fieldset {form} name="type">
			<Form.Legend>{m.roster_field_type()}</Form.Legend>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				bind:value={() => $formData.type, (value) => setType(value as PatternType | '')}
				class="self-start"
			>
				<ToggleGroup.Item value="cycle">{m.roster_type_cycle()}</ToggleGroup.Item>
				<ToggleGroup.Item value="weekly">{m.roster_type_weekly()}</ToggleGroup.Item>
			</ToggleGroup.Root>
			<Form.Description>
				{$formData.type === 'weekly'
					? m.roster_type_weekly_description()
					: m.roster_type_cycle_description()}
			</Form.Description>
		</Form.Fieldset>

		<Form.Fieldset {form} name="slots">
			<Form.Legend>{m.roster_field_cycle()}</Form.Legend>
			<CycleEditor bind:value={$formData.slots} type={$formData.type} {shifts} />
			<Form.FieldErrors />
		</Form.Fieldset>

		{#if copySources.length > 0}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm" class="self-start">
							<CopyIcon data-icon="inline-start" />
							{m.roster_copy_from()}
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start">
					{#each copySources as source (source.id)}
						<DropdownMenu.Item
							onSelect={() => {
								$formData.type = source.type;
								$formData.slots = [...source.slots];
							}}
						>
							<span class="flex-1">{source.label}</span>
							<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
								{slotCodes(source.slots, byId)}
							</bdi>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			{#if $formData.type === 'cycle'}
				<Form.Field {form} name="anchorDate">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.roster_field_anchor()}</Form.Label>
							<Input {...props} type="date" bind:value={$formData.anchorDate} />
						{/snippet}
					</Form.Control>
					<Form.Description>{m.roster_field_anchor_description()}</Form.Description>
					<Form.FieldErrors />
				</Form.Field>
			{/if}

			<Form.Field {form} name="effectiveFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_effective_from()}</Form.Label>
						<Input {...props} type="date" min={today} bind:value={$formData.effectiveFrom} />
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
					<Textarea {...props} bind:value={$formData.reason} rows={2} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Button class="self-start" disabled={$delayed}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{m.roster_save_pattern()}
		</Form.Button>
	</form>

	{@render preview(draft)}
</div>
