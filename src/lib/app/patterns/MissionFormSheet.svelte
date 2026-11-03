<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { missionFormSchema, type PatternPayMessage } from '#lib/schemas/pattern-pay.schema.js';
	import type { MissionCandidate } from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide, personName } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof missionFormSchema>, PatternPayMessage>;
		/** People the pattern reaches around today; the service checks every date. */
		candidates: MissionCandidate[];
		open: boolean;
	};

	let { data, candidates, open = $bindable() }: Props = $props();

	const uid = $props.id();

	const form = superForm(
		untrack(() => data),
		{
			// `staffIds` is a list.
			dataType: 'json',
			validators: zod4Client(missionFormSchema),
			// Several forms share the pattern page: the load data wins after a save.
			invalidateAll: 'pessimistic',
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	let query = $state('');
	const shown = $derived.by(() => {
		const q = query.trim().toLocaleLowerCase();
		return q
			? candidates.filter(
					(c) =>
						c.fullName.toLocaleLowerCase().includes(q) ||
						(c.fullNameAr?.includes(q) ?? false) ||
						c.employeeNo.includes(q)
				)
			: candidates;
	});

	function toggle(staffId: string, checked: boolean) {
		$formData.staffIds = checked
			? [...$formData.staffIds, staffId]
			: $formData.staffIds.filter((id) => id !== staffId);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.pattern_mission_sheet_title()}</Sheet.Title>
			<Sheet.Description>{m.pattern_mission_sheet_description()}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/addMission" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
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

			<Form.Fieldset {form} name="staffIds" class="flex flex-col gap-2">
				<Form.Legend>{m.pattern_mission_field_members()}</Form.Legend>
				{#if candidates.length === 0}
					<p class="text-sm text-muted-foreground">{m.pattern_mission_no_candidates()}</p>
				{:else}
					<InputGroup.Root>
						<InputGroup.Addon>
							<MagnifyingGlassIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							type="search"
							bind:value={query}
							placeholder={m.assign_search()}
							aria-label={m.assign_search()}
						/>
					</InputGroup.Root>
					<ul class="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md bg-muted/40 p-2">
						{#each shown as candidate (candidate.staffId)}
							<li class="flex items-center gap-2">
								<Checkbox
									id="{uid}-{candidate.staffId}"
									checked={$formData.staffIds.includes(candidate.staffId)}
									onCheckedChange={(checked) => toggle(candidate.staffId, checked === true)}
								/>
								<Label for="{uid}-{candidate.staffId}" class="font-normal">
									{personName(candidate)}
									<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
										{candidate.employeeNo}
									</bdi>
								</Label>
							</li>
						{:else}
							<li class="p-2 text-sm text-muted-foreground">{m.assign_no_matches()}</li>
						{/each}
					</ul>
					<p class="text-sm text-muted-foreground">
						{m.assign_chosen({ count: $formData.staffIds.length })}
					</p>
				{/if}
				<Form.FieldErrors />
			</Form.Fieldset>

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
				{m.pattern_mission_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
