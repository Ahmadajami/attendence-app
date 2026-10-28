<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import LockSimpleIcon from 'phosphor-svelte/lib/LockSimpleIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import ShiftHintText from '#lib/app/shifts/ShiftHintText.svelte';
	import { shiftHint } from '#lib/app/shifts/hint.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { SHIFT_COLOURS } from '#lib/schemas/enums.js';
	import { shiftFormSchema, type ShiftMessage } from '#lib/schemas/shift.schema.js';
	import type { ShiftListItem } from '#lib/server/services/shifts/shifts.bl.js';
	import { shiftColourClass } from '#lib/app/roster/colours.js';
	import { cn } from '#lib/utils.js';
	import { endSide, lookupName } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof shiftFormSchema>, ShiftMessage>;
		/** `null`: create. */
		target: ShiftListItem | null;
		open: boolean;
	};

	let { data, target, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			// Locked (disabled) fields must still post their values.
			dataType: 'json',
			validators: zod4Client(shiftFormSchema),
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') {
					toast.success(form.message.text);
					open = false;
					void invalidateAll();
				} else if (form.message?.kind === 'error') {
					toast.error(form.message.text);
				}
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData = {
			shiftId: target?.id ?? '',
			code: target?.code ?? '',
			nameEn: target?.nameEn ?? '',
			nameAr: target?.nameAr ?? '',
			colour: (target?.colour as (typeof SHIFT_COLOURS)[number] | undefined) ?? SHIFT_COLOURS[0],
			startTime: target?.startTime.slice(0, 5) ?? '',
			endTime: target?.endTime.slice(0, 5) ?? '',
			breakMinutes: target?.breakMinutes ?? 0,
			requiredMinutes: target?.requiredMinutes ?? null,
			windowBeforeMinutes: target?.windowBeforeMinutes ?? 180,
			windowAfterMinutes: target?.windowAfterMinutes ?? 360,
			graceMinutes: target?.graceMinutes ?? 0
		};
	});

	/** Plan P1: a used shift keeps its code, times, break, required and windows. */
	const locked = $derived(target?.used ?? false);

	const hint = $derived(
		shiftHint(
			$formData.startTime,
			$formData.endTime,
			$formData.breakMinutes,
			$formData.requiredMinutes
		)
	);
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{target ? m.shifts_edit() : m.shifts_new()}</Sheet.Title>
			<Sheet.Description>
				{target
					? m.shifts_edit_description({ name: `${lookupName(target)} (${target.code})` })
					: m.shifts_create_description()}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/save" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			{#if locked}
				<p class="flex gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
					<LockSimpleIcon class="mt-0.5 size-4 shrink-0" />
					{m.shifts_locked_explanation()}
				</p>
			{/if}

			<Form.Field {form} name="code">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.shifts_field_code()}</Form.Label>
						<Input
							{...props}
							value={$formData.code}
							oninput={(event) => ($formData.code = event.currentTarget.value.toUpperCase())}
							maxlength={3}
							class="w-24 font-mono uppercase"
							dir="ltr"
							autocomplete="off"
							disabled={locked}
						/>
					{/snippet}
				</Form.Control>
				<Form.Description>{m.shifts_field_code_description()}</Form.Description>
				<Form.FieldErrors />
			</Form.Field>

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="nameEn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_name_en()}</Form.Label>
							<Input {...props} bind:value={$formData.nameEn} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="nameAr">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_name_ar()}</Form.Label>
							<Input {...props} bind:value={$formData.nameAr} dir="rtl" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<Form.Field {form} name="startTime">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_start()}</Form.Label>
							<Input
								{...props}
								type="time"
								bind:value={$formData.startTime}
								dir="ltr"
								disabled={locked}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="endTime">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_end()}</Form.Label>
							<Input
								{...props}
								type="time"
								bind:value={$formData.endTime}
								dir="ltr"
								disabled={locked}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<p class="-mt-2 min-h-5 text-sm text-muted-foreground" aria-live="polite">
				{#if hint}
					<ShiftHintText {hint} />
				{/if}
			</p>

			<div class="grid grid-cols-2 gap-4">
				<Form.Field {form} name="breakMinutes">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_break()}</Form.Label>
							<Input
								{...props}
								type="number"
								min={0}
								max={720}
								bind:value={$formData.breakMinutes}
								disabled={locked}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="requiredMinutes">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_required()}</Form.Label>
							<Input
								{...props}
								type="number"
								min={1}
								max={1440}
								placeholder={hint ? String(hint.requiredMinutes) : undefined}
								bind:value={$formData.requiredMinutes}
								disabled={locked}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>{m.shifts_field_required_description()}</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="windowBeforeMinutes">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_window_before()}</Form.Label>
							<Input
								{...props}
								type="number"
								min={0}
								max={720}
								bind:value={$formData.windowBeforeMinutes}
								disabled={locked}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="windowAfterMinutes">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_window_after()}</Form.Label>
							<Input
								{...props}
								type="number"
								min={0}
								max={720}
								bind:value={$formData.windowAfterMinutes}
								disabled={locked}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="graceMinutes">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.shifts_field_grace()}</Form.Label>
							<Input
								{...props}
								type="number"
								min={0}
								max={120}
								bind:value={$formData.graceMinutes}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>{m.shifts_field_grace_description()}</Form.Description>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<Form.Fieldset {form} name="colour">
				<Form.Legend>{m.shifts_field_colour()}</Form.Legend>
				<div class="flex flex-wrap gap-2" role="radiogroup" aria-label={m.shifts_field_colour()}>
					{#each SHIFT_COLOURS as colour, index (colour)}
						{const selected = $formData.colour === colour}
						<button
							type="button"
							role="radio"
							aria-checked={selected}
							aria-label={m.shifts_colour_option({ number: index + 1 })}
							class={cn(
								'flex size-8 items-center justify-center rounded-md ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
								shiftColourClass(colour),
								selected && 'ring-2 ring-ring ring-offset-2'
							)}
							onclick={() => ($formData.colour = colour)}
						>
							{#if selected}<CheckIcon class="size-4" />{/if}
						</button>
					{/each}
				</div>
				<Form.FieldErrors />
			</Form.Fieldset>

			<Form.Button class="self-start" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{target ? m.shifts_save() : m.shifts_create()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
