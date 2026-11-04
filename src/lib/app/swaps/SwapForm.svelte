<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resource } from 'runed';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { formatMonth } from '#lib/app/roster/labels.js';
	import { previewDays } from '#lib/app/roster/preview.js';
	import RosterPreview from '#lib/app/roster/RosterPreview.svelte';
	import type { PersonOption } from '#lib/attendance/person-search.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { previewSwap, swapRoster } from '#lib/remote/swaps.remote.js';
	import { addDays } from '#lib/roster/cycle.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import { SWAP_KIND_LABEL, SWAP_SCOPE_LABEL } from '#lib/roster/swap-labels.js';
	import { SWAP_KINDS, SWAP_SCOPES, type SwapKind, type SwapScope } from '#lib/schemas/enums.js';
	import {
		swapFormSchema,
		type SwapFormInput,
		type SwapMessage
	} from '#lib/schemas/swap.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { personName } from '#lib/utils/locale.js';
	import PersonPicker from './PersonPicker.svelte';
	import SwapEffect from './SwapEffect.svelte';

	// New swap (swaps plan SW2, SW3, SW9): the kind, the people, the dates, the scope, "pay as
	// overtime" and a reason. A and B's roster for a month shows who works and who is off; tapping a
	// day sets the picked date. A live preview shows what the swap does. Each read asks only about
	// the fields it needs, and keeps its last answer on screen while the next one loads. Save
	// request leaves it pending; Save and approve (`roster.manage`) applies it at once; either
	// opens the saved swap on `/changes`.

	type Props = {
		data: SuperValidated<SwapFormInput, SwapMessage>;
		shifts: ReadonlyMap<string, Pick<RosterShift, 'code' | 'colour'>>;
		canApprove: boolean;
		/** Person A as loaded (`?staff=`), for the picker's label. */
		person: PersonOption | null;
		today: string;
	};

	let { data, shifts, canApprove, person, today }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(swapFormSchema),
			...statusToasts<SwapFormInput, SwapMessage>((message) => {
				if (!message.swapId) return;
				const params = new URLSearchParams({
					swap: message.swapId,
					state: message.tab ?? 'pending',
					...(message.month ? { month: message.month } : {})
				});
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref resolves it
				void goto(`${localizedHref('/changes')}?${params}`);
			})
		}
	);
	const { form: formData, enhance, delayed } = form;

	// The fields the reads depend on, one by one: typing the reason asks the server nothing.
	const kind = $derived($formData.kind);
	const emp = $derived(kind === 'emp_swap');
	const staffId = $derived($formData.staffId);
	const otherStaffId = $derived(emp ? $formData.otherStaffId : '');
	const firstDate = $derived($formData.firstDate);
	const secondDate = $derived($formData.secondDate);
	const scope = $derived($formData.scope);

	/** Drops an answer that arrives after a newer question. */
	const fresh = <T,>(value: T, signal: AbortSignal): T => {
		if (signal.aborted) throw new DOMException('stale', 'AbortError');
		return value;
	};

	const effect = resource(
		[() => kind, () => staffId, () => otherStaffId, () => firstDate, () => secondDate, () => scope],
		async ([kind, staffId, otherStaffId, firstDate, secondDate, scope], _previous, { signal }) =>
			fresh(
				await previewSwap({ kind, staffId, otherStaffId, firstDate, secondDate, scope }),
				signal
			),
		{ debounce: 300 }
	);

	/** The grid's month: the first date's, else this month; the arrows move it. */
	let month = $derived((firstDate || today).slice(0, 7));
	const otherMonth = (step: -1 | 1) => addDays(`${month}-01`, step < 0 ? -1 : 32).slice(0, 7);

	/** A, then B on an employee swap: whose roster the grid shows. */
	const people = $derived([staffId, otherStaffId].filter(Boolean).join(','));
	const roster = resource(
		[() => people, () => month],
		async ([people, month], _previous, { signal }) =>
			fresh(people ? await swapRoster({ staffIds: people.split(','), month }) : null, signal),
		{ debounce: 100 }
	);
	const rows = $derived.by(() => {
		const loaded = roster.current;
		if (!loaded) return [];
		return loaded.people.map((p, i) => ({
			id: p.staffId,
			label: `${i === 0 ? 'A' : 'B'} · ${personName(p)}`,
			days: previewDays(loaded.roster, p.staffId)
		}));
	});

	type DateTarget = 'first' | 'second';
	/** Which date a tap on the grid sets; it moves on to the other one after a tap. */
	let pick = $state<DateTarget>('first');
	function pickDay(date: string) {
		if (pick === 'first') {
			$formData.firstDate = date;
			pick = 'second';
		} else {
			$formData.secondDate = date;
			pick = 'first';
		}
	}
</script>

<form method="POST" class="flex flex-col gap-4" use:enhance>
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.swap_section_who()}</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Form.Field {form} name="kind">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.swap_field_kind()}</Form.Label>
							<Select.Root type="single" name={props.name} bind:value={$formData.kind}>
								<Select.Trigger {...props} class="w-full">
									{SWAP_KIND_LABEL[$formData.kind]()}
								</Select.Trigger>
								<Select.Content>
									{#each SWAP_KINDS as option (option)}
										<Select.Item value={option} label={SWAP_KIND_LABEL[option as SwapKind]()} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="scope">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.swap_field_scope()}</Form.Label>
							<Select.Root type="single" name={props.name} bind:value={$formData.scope}>
								<Select.Trigger {...props} class="w-full">
									{SWAP_SCOPE_LABEL[$formData.scope]()}
								</Select.Trigger>
								<Select.Content>
									{#each SWAP_SCOPES as option (option)}
										<Select.Item value={option} label={SWAP_SCOPE_LABEL[option as SwapScope]()} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="staffId">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.swap_field_person()}</Form.Label>
							<PersonPicker {...props} bind:value={$formData.staffId} {person} class="w-full" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				{#if emp}
					<Form.Field {form} name="otherStaffId">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>{m.swap_field_other()}</Form.Label>
								<PersonPicker {...props} bind:value={$formData.otherStaffId} class="w-full" />
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				{/if}
			</div>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Form.Field {form} name="firstDate">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>
								{emp ? m.swap_field_emp_first() : m.swap_field_self_first()}
							</Form.Label>
							<Input {...props} type="date" bind:value={$formData.firstDate} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="secondDate">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>
								{emp ? m.swap_field_emp_second() : m.swap_field_self_second()}
							</Form.Label>
							<Input {...props} type="date" bind:value={$formData.secondDate} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.swap_roster_title()}</Card.Title>
			<Card.Description>{m.swap_roster_description()}</Card.Description>
			<Card.Action class="flex items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={m.swap_roster_prev()}
					onclick={() => (month = otherMonth(-1))}
				>
					<CaretLeftIcon class="rtl:rotate-180" />
				</Button>
				<span class="min-w-32 text-center text-sm font-medium">{formatMonth(month)}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={m.swap_roster_next()}
					onclick={() => (month = otherMonth(1))}
				>
					<CaretRightIcon class="rtl:rotate-180" />
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#if !people}
				<p class="text-sm text-muted-foreground">{m.swap_roster_waiting()}</p>
			{:else if roster.error && !roster.current}
				<p class="text-sm text-destructive">{m.swap_roster_failed()}</p>
			{:else if rows.length === 0}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<SpinnerGapIcon class="size-4 animate-spin" />
					{m.swap_roster_loading()}
				</p>
			{:else}
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<span class="text-muted-foreground">{m.swap_roster_pick()}</span>
					<ToggleGroup.Root
						type="single"
						variant="outline"
						size="sm"
						bind:value={() => pick, (value) => value && (pick = value as DateTarget)}
					>
						<ToggleGroup.Item value="first">
							{emp ? m.swap_pick_emp_first() : m.swap_pick_self_first()}
						</ToggleGroup.Item>
						<ToggleGroup.Item value="second">
							{emp ? m.swap_pick_emp_second() : m.swap_pick_self_second()}
						</ToggleGroup.Item>
					</ToggleGroup.Root>
					{#if roster.loading}
						<SpinnerGapIcon class="size-4 animate-spin text-muted-foreground" />
					{/if}
				</div>
				<RosterPreview
					{rows}
					{today}
					selectedDays={[firstDate, secondDate].filter(Boolean)}
					onSelectDay={pickDay}
				/>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				{m.swap_preview_title()}
				{#if effect.loading}
					<SpinnerGapIcon class="size-4 animate-spin text-muted-foreground" />
				{/if}
			</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if effect.error && !effect.current}
				<p class="text-sm text-destructive">{m.swap_preview_failed()}</p>
			{:else if effect.current}
				<SwapEffect effect={effect.current} {shifts} {scope} />
			{:else}
				<p class="text-sm text-muted-foreground">{m.swap_preview_waiting()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.swap_section_save()}</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<Form.Field {form} name="payAsOt" class="flex flex-col gap-1">
				<Form.Control>
					{#snippet children({ props })}
						<div class="flex items-center gap-2">
							<Checkbox {...props} bind:checked={$formData.payAsOt} />
							<Form.Label>{m.swap_field_pay_as_ot()}</Form.Label>
						</div>
					{/snippet}
				</Form.Control>
				<Form.Description>{m.swap_pay_as_ot_hint()}</Form.Description>
			</Form.Field>
			<Form.Field {form} name="reason">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_reason()}</Form.Label>
						<Textarea {...props} bind:value={$formData.reason} rows={2} />
					{/snippet}
				</Form.Control>
				<Form.Description>{m.swap_reason_hint()}</Form.Description>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
		<Card.Footer class="flex flex-wrap gap-2">
			<Form.Button variant={canApprove ? 'outline' : 'default'} disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{m.swap_save()}
			</Form.Button>
			{#if canApprove}
				<!-- The submitter's name and value post `approve` (SW3). -->
				<Form.Button name="approve" value="true" disabled={$delayed}>
					{m.swap_save_approve()}
				</Form.Button>
			{/if}
		</Card.Footer>
	</Card.Root>
</form>
