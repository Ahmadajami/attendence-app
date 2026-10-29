<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import ChartBarIcon from 'phosphor-svelte/lib/ChartBarIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		assignmentFormSchema,
		type AssignTargetKind,
		type PatternMessage
	} from '#lib/schemas/pattern.schema.js';
	import type { TargetImpact } from '#lib/server/services/assignments/assignments.bl.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide, lookupName } from '#lib/utils/locale.js';
	import { fetchImpact } from './impact.js';
	import ImpactSummary from './ImpactSummary.svelte';
	import type { AssignablePattern } from './types.js';

	type Props = {
		data: SuperValidated<Infer<typeof assignmentFormSchema>, PatternMessage>;
		/** Form action, e.g. `?/assign`. */
		action: string;
		/** Who gets the pattern: fixed by the page (a team, a person, a department). */
		targetKind: AssignTargetKind;
		targetId: string;
		/** Active library patterns. */
		patterns: AssignablePattern[];
		/** Damascus today: the earliest start date (B7). */
		today: string;
		/** "Build a new pattern" link, prefilled with this target. */
		buildHref?: string;
		title: string;
		description: string;
		open: boolean;
	};

	let {
		data,
		action,
		targetKind,
		targetId,
		patterns,
		today,
		buildHref,
		title,
		description,
		open = $bindable()
	}: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			// `targetIds` is an array.
			dataType: 'json',
			validators: zod4Client(assignmentFormSchema),
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.targetKind = targetKind;
		$formData.targetIds = [targetId];
	});

	/** The last preview, for the target it was made for (a list page changes the target per row). */
	let result = $state<{ key: string; impacts: TargetImpact[] | null; error: string | null }>({
		key: '',
		impacts: null,
		error: null
	});
	const targetKey = $derived(`${targetKind}:${targetId}`);
	/** Another target's answer (a list page reuses the sheet) is not shown. */
	const shown = $derived(result.key === targetKey ? result : null);
	let impactLoading = $state(false);

	const chosen = $derived(patterns.find((p) => p.id === $formData.patternId) ?? null);

	async function preview() {
		if (!chosen) return;
		const key = targetKey;
		impactLoading = true;
		try {
			const found = await fetchImpact({
				type: chosen.type,
				slots: chosen.slots,
				defaultWorkShiftId: chosen.defaultWorkShiftId ?? '',
				targetKind,
				targetIds: [targetId],
				effectiveFrom: $formData.effectiveFrom,
				anchorDate: $formData.anchorDate
			});
			result = { key, impacts: found, error: null };
		} catch (cause) {
			result = {
				key,
				impacts: null,
				error: cause instanceof Error ? cause.message : String(cause)
			};
		} finally {
			impactLoading = false;
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{title}</Sheet.Title>
			<Sheet.Description>{description}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" {action} class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<Form.Field {form} name="patternId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.assign_field_pattern()}</Form.Label>
						<Select.Root type="single" name={props.name} bind:value={$formData.patternId}>
							<Select.Trigger {...props} class="w-full">
								{chosen ? lookupName(chosen) : m.assign_pattern_placeholder()}
							</Select.Trigger>
							<Select.Content>
								{#each patterns as option (option.id)}
									<Select.Item value={option.id} label={lookupName(option)} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			{#if buildHref}
				<Button href={buildHref} variant="link" size="sm" class="self-start px-0">
					<PlusIcon data-icon="inline-start" />
					{m.assign_build_new()}
				</Button>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="effectiveFrom">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.roster_field_effective_from()}</Form.Label>
							<Input {...props} type="date" min={today} bind:value={$formData.effectiveFrom} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				{#if chosen?.type === 'cycle'}
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

			<div class="flex flex-col gap-2 rounded-md bg-muted p-3">
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="self-start"
					disabled={!chosen || !$formData.effectiveFrom || impactLoading}
					onclick={preview}
				>
					{#if impactLoading}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{:else}
						<ChartBarIcon data-icon="inline-start" />
					{/if}
					{m.assign_preview()}
				</Button>
				{#if shown && shown.error !== null}
					<p class="text-sm text-destructive">{shown.error}</p>
				{:else if shown?.impacts}
					<ImpactSummary impacts={shown.impacts} />
				{:else}
					<p class="text-sm text-muted-foreground">{m.assign_preview_hint()}</p>
				{/if}
			</div>

			<Form.Button class="self-start" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{m.assign_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
