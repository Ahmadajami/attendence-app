<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import ChartBarIcon from 'phosphor-svelte/lib/ChartBarIcon';
	import LockSimpleIcon from 'phosphor-svelte/lib/LockSimpleIcon';
	import PencilSimpleLineIcon from 'phosphor-svelte/lib/PencilSimpleLineIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import ShiftFormSheet from '#lib/app/shifts/ShiftFormSheet.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { earliestEffectiveDate } from '#lib/roster/backdate.js';
	import { WEEKLY_SLOTS } from '#lib/payroll/schedule.js';
	import { addDays, mostUsedShift, patternSlot } from '#lib/roster/cycle.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import { averageWeeklyMinutes } from '#lib/roster/pattern-stats.js';
	import { PRESETS, resolvePreset } from '#lib/roster/presets.js';
	import { formatWallClock } from '#lib/app/roster/labels.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { PatternType } from '#lib/schemas/enums.js';
	import {
		editFromDateSchema,
		patternBuilderSchema,
		type AssignTargetKind,
		type PatternMessage
	} from '#lib/schemas/pattern.schema.js';
	import { shiftFormSchema, type ShiftMessage } from '#lib/schemas/shift.schema.js';
	import type { TargetImpact } from '#lib/server/services/assignments/assignments.bl.js';
	import { lookupName } from '#lib/utils/locale.js';
	import CycleEditor from '../roster/CycleEditor.svelte';
	import { formatPreviewDay, shiftsById } from '../roster/labels.js';
	import ShiftChip from '../roster/ShiftChip.svelte';
	import EditFromDateSheet from './EditFromDateSheet.svelte';
	import { fetchImpact } from './impact.js';
	import ImpactSummary from './ImpactSummary.svelte';
	import TargetPicker from './TargetPicker.svelte';

	type TargetOption = {
		id: string;
		nameEn: string;
		nameAr: string | null;
		detail: string | null;
		departmentId: string | null;
	};

	type Props = {
		form: SuperValidated<Infer<typeof patternBuilderSchema>, PatternMessage>;
		/** Every shift: the active ones form the palette. */
		shifts: RosterShift[];
		targets: Record<AssignTargetKind, TargetOption[]>;
		departments: { id: string; nameEn: string; nameAr: string }[];
		today: string;
		canManage: boolean;
		/** The saved pattern (`null`: a new one). Once used, its days are read-only (B3). */
		pattern: { id: string; used: boolean; active: boolean; followers: unknown[] } | null;
		/** Back to the page that asked for a new pattern ("Build a new pattern"). */
		returnTarget: { kind: AssignTargetKind; id: string } | null;
		editForm: SuperValidated<Infer<typeof editFromDateSchema>, PatternMessage> | null;
		shiftForm: SuperValidated<Infer<typeof shiftFormSchema>, ShiftMessage>;
	};

	let {
		form: data,
		shifts,
		targets,
		departments,
		today,
		canManage,
		pattern,
		returnTarget,
		editForm,
		shiftForm
	}: Props = $props();

	/**
	 * Where to go after creating: back to the asking page, else the new pattern's "Overtime & pay"
	 * tab (pay plan PR39).
	 */
	function afterCreate(id: string) {
		if (returnTarget?.kind === 'team') return localizedHref('/teams/[id]', { id: returnTarget.id });
		if (returnTarget?.kind === 'staff')
			return localizedHref('/employees/[id]', { id: returnTarget.id });
		if (returnTarget?.kind === 'department') return localizedHref('/departments');
		return `${localizedHref('/patterns/[id]', { id })}?tab=pay`;
	}

	const form = superForm(
		untrack(() => data),
		{
			// Slots hold `null` (off) and the targets are an array.
			dataType: 'json',
			validators: zod4Client(patternBuilderSchema),
			// The builder stays open after saving an existing pattern.
			resetForm: false,
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') {
					toast.success(form.message.text);
					if (!pattern) {
						if (!returnTarget) toast.info(m.patterns_created_pay_hint());
						// eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() + `?tab=`
						void goto(afterCreate(form.data.patternId));
					}
				} else if (form.message?.kind === 'error') {
					toast.error(form.message.text);
				}
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed } = form;

	const locked = $derived((pattern?.used ?? false) || !canManage);
	const byId = $derived(shiftsById(shifts));
	const active = $derived(shifts.filter((s) => s.active));

	/** A weekly pattern always has 7 slots; clicking the selected toggle changes nothing. */
	function setType(type: PatternType | '') {
		if (!type || type === $formData.type) return;
		$formData.type = type;
		if (type === 'weekly')
			$formData.slots = Array.from({ length: WEEKLY_SLOTS }, (_, i) => $formData.slots[i] ?? null);
	}

	const presetName: Record<string, () => string> = {
		office_sun_thu: m.patterns_preset_office_sun_thu,
		six_on_one_off: m.patterns_preset_six_on_one_off,
		day_night_2_2_4: m.patterns_preset_day_night_2_2_4,
		nights_4_on_4_off: m.patterns_preset_nights_4_on_4_off,
		days_4_on_4_off: m.patterns_preset_days_4_on_4_off,
		nights_days_24_8: m.patterns_preset_nights_days_24_8
	};
	/** Weekly presets fill their working days with the pattern's main shift (or the first active). */
	const brush = $derived(mostUsedShift($formData.slots) ?? active[0]?.id ?? null);
	const presets = $derived(
		PRESETS.map((preset) => ({ preset, result: resolvePreset(preset, active, brush) }))
	);
	function applyPreset(result: { type: PatternType; slots: (string | null)[] }) {
		$formData.type = result.type;
		$formData.slots = [...result.slots];
	}

	/** 14 days from the start date (or today), on the anchor for a cycle. */
	const strip = $derived.by(() => {
		const start = $formData.assign && $formData.effectiveFrom ? $formData.effectiveFrom : today;
		const anchorDate =
			$formData.type === 'cycle'
				? $formData.assign && $formData.anchorDate
					? $formData.anchorDate
					: start
				: null;
		return Array.from({ length: 14 }, (_, i) => {
			const date = addDays(start, i);
			const id = patternSlot({ type: $formData.type, slots: $formData.slots, anchorDate }, date);
			return { date, shift: id === null ? null : (byId.get(id) ?? null) };
		});
	});
	const weekly = $derived(
		formatHoursMinutes(averageWeeklyMinutes({ type: $formData.type, slots: $formData.slots }, byId))
	);

	const AUTO = 'auto';
	const autoShift = $derived(byId.get(mostUsedShift($formData.slots) ?? ''));
	const defaultShift = $derived(byId.get($formData.defaultWorkShiftId));

	let shiftOpen = $state(false);
	let editOpen = $state(false);

	/** What a preview depends on: once any of it changes, the shown preview is stale. */
	const impactRequest = $derived({
		type: $formData.type,
		slots: $formData.slots,
		defaultWorkShiftId: $formData.defaultWorkShiftId,
		targetKind: $formData.targetKind,
		targetIds: $formData.targetIds,
		effectiveFrom: $formData.effectiveFrom,
		anchorDate: $formData.anchorDate
	});
	const impactKey = $derived(JSON.stringify(impactRequest));
	let result = $state<{ key: string; impacts: TargetImpact[] | null; error: string | null }>({
		key: '',
		impacts: null,
		error: null
	});
	/** The last answer stays visible; it is flagged once the form no longer matches it. */
	const impactStale = $derived(result.key !== '' && result.key !== impactKey);
	let impactLoading = $state(false);

	async function preview() {
		const key = impactKey;
		impactLoading = true;
		try {
			result = { key, impacts: await fetchImpact(impactRequest), error: null };
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

<form method="POST" action="?/save" class="flex flex-col gap-4" use:enhance>
	{#if pattern?.used}
		<div class="flex flex-wrap items-center gap-3 rounded-md bg-muted p-3 text-sm">
			<LockSimpleIcon class="size-4 shrink-0" />
			<p class="flex-1">{m.patterns_used_explanation()}</p>
			{#if canManage && editForm}
				<Button type="button" variant="outline" size="sm" onclick={() => (editOpen = true)}>
					<PencilSimpleLineIcon data-icon="inline-start" />
					{m.patterns_edit_from_date()}
				</Button>
			{/if}
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.patterns_step_1()}</Card.Title>
			<Card.Description>{m.patterns_step_1_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="nameEn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.patterns_field_name_en()}</Form.Label>
							<Input
								{...props}
								bind:value={$formData.nameEn}
								dir="ltr"
								autocomplete="off"
								disabled={!canManage}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="nameAr">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.patterns_field_name_ar()}</Form.Label>
							<Input
								{...props}
								bind:value={$formData.nameAr}
								dir="rtl"
								autocomplete="off"
								disabled={!canManage}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<Form.Fieldset {form} name="type">
				<Form.Legend>{m.roster_field_type()}</Form.Legend>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					class="self-start"
					disabled={locked}
					bind:value={() => $formData.type, (value) => setType(value as PatternType | '')}
				>
					<ToggleGroup.Item value="weekly">{m.roster_type_weekly()}</ToggleGroup.Item>
					<ToggleGroup.Item value="cycle">{m.roster_type_cycle()}</ToggleGroup.Item>
				</ToggleGroup.Root>
				<Form.Description>
					{$formData.type === 'weekly'
						? m.roster_type_weekly_description()
						: m.roster_type_cycle_description()}
				</Form.Description>
			</Form.Fieldset>

			{#if !locked}
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium">{m.patterns_presets()}</p>
					<div class="flex flex-wrap gap-2">
						{#each presets as { preset, result } (preset.key)}
							{const missing = $derived('missing' in result ? result.missing : [])}
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={missing.length > 0}
								title={missing.length > 0
									? m.patterns_preset_missing({ codes: missing.join(m.list_separator()) })
									: undefined}
								onclick={() => 'slots' in result && applyPreset(result)}
							>
								{presetName[preset.key]?.() ?? preset.key}
							</Button>
						{/each}
					</div>
					{#if presets.some(({ result }) => 'missing' in result)}
						<p class="text-xs text-muted-foreground">{m.patterns_presets_missing_hint()}</p>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.patterns_step_2()}</Card.Title>
			<Card.Description>{m.patterns_step_2_description()}</Card.Description>
			{#if !locked}
				<Card.Action>
					<Button type="button" variant="outline" size="sm" onclick={() => (shiftOpen = true)}>
						<PlusIcon data-icon="inline-start" />
						{m.patterns_new_shift()}
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<Form.Fieldset {form} name="slots">
				<Form.Legend class="sr-only">{m.roster_field_cycle()}</Form.Legend>
				<CycleEditor
					bind:value={$formData.slots}
					type={$formData.type}
					{shifts}
					disabled={locked}
				/>
				<Form.FieldErrors />
			</Form.Fieldset>

			<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
				{#each active as shift (shift.id)}
					<li class="flex items-center gap-2">
						<ShiftChip {shift} />
						{lookupName(shift)}
						<bdi dir="ltr"
							>{formatWallClock(shift.startTime)} → {formatWallClock(shift.endTime)}</bdi
						>
					</li>
				{/each}
			</ul>

			<div class="flex flex-col gap-2">
				<p class="text-sm font-medium">{m.patterns_next_14_days()}</p>
				<ol class="flex flex-wrap gap-1">
					{#each strip as day (day.date)}
						{const label = $derived(formatPreviewDay(day.date))}
						<li class="flex flex-col items-center gap-0.5 text-[0.625rem] text-muted-foreground">
							<ShiftChip shift={day.shift} />
							<span>{label.weekday} {label.day}</span>
						</li>
					{/each}
				</ol>
				<p class="text-sm text-muted-foreground">{m.patterns_avg_week({ time: weekly })}</p>
			</div>

			{#if $formData.type === 'weekly'}
				<Form.Field {form} name="defaultWorkShiftId">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.patterns_field_default_work()}</Form.Label>
							<Select.Root
								type="single"
								disabled={locked}
								bind:value={
									() => $formData.defaultWorkShiftId || AUTO,
									(value) => ($formData.defaultWorkShiftId = value === AUTO ? '' : value)
								}
							>
								<Select.Trigger {...props} class="w-64">
									{defaultShift
										? lookupName(defaultShift)
										: m.patterns_default_work_auto({
												name: autoShift ? lookupName(autoShift) : '—'
											})}
								</Select.Trigger>
								<Select.Content>
									<Select.Item
										value={AUTO}
										label={m.patterns_default_work_auto({
											name: autoShift ? lookupName(autoShift) : '—'
										})}
									/>
									{#each active as shift (shift.id)}
										<Select.Item value={shift.id} label={lookupName(shift)} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.Description>{m.patterns_field_default_work_description()}</Form.Description>
					<Form.FieldErrors />
				</Form.Field>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.patterns_step_3()}</Card.Title>
			<Card.Description>{m.patterns_step_3_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="flex items-center gap-2">
				<Switch
					id="builder-assign"
					bind:checked={$formData.assign}
					disabled={!canManage || (pattern !== null && !pattern.active)}
				/>
				<Label for="builder-assign">{m.patterns_assign_now()}</Label>
			</div>
			{#if pattern && !pattern.active}
				<p class="text-sm text-muted-foreground">{m.patterns_error_inactive()}</p>
			{/if}

			{#if $formData.assign}
				<Form.Fieldset {form} name="targetIds">
					<Form.Legend>{m.patterns_assign_to()}</Form.Legend>
					<TargetPicker
						bind:kind={$formData.targetKind}
						bind:ids={$formData.targetIds}
						options={targets}
						{departments}
					/>
					<Form.FieldErrors />
				</Form.Fieldset>

				<div class="grid gap-4 sm:grid-cols-2">
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
						disabled={$formData.targetIds.length === 0 || !$formData.effectiveFrom || impactLoading}
						onclick={preview}
					>
						{#if impactLoading}
							<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
						{:else}
							<ChartBarIcon data-icon="inline-start" />
						{/if}
						{m.assign_preview()}
					</Button>
					{#if result.error !== null}
						<p class="text-sm text-destructive">{result.error}</p>
					{:else if result.impacts}
						<ImpactSummary
							impacts={result.impacts}
							class={impactStale ? 'opacity-50' : undefined}
						/>
						{#if impactStale}
							<p class="text-xs text-muted-foreground">{m.assign_preview_stale()}</p>
						{/if}
					{:else}
						<p class="text-sm text-muted-foreground">{m.assign_preview_hint()}</p>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if canManage}
		<Form.Button class="self-start" disabled={$delayed}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{pattern ? m.patterns_save() : m.patterns_create()}
		</Form.Button>
	{/if}
</form>

{#if canManage}
	<ShiftFormSheet data={shiftForm} target={null} action="?/saveShift" bind:open={shiftOpen} />
	{#if editForm}
		<EditFromDateSheet data={editForm} {shifts} {today} bind:open={editOpen} />
	{/if}
{/if}
