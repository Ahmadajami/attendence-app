<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import { editFromDateSchema, type PatternMessage } from '#lib/schemas/pattern.schema.js';
	import { endSide } from '#lib/utils/locale.js';
	import CycleEditor from '../roster/CycleEditor.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof editFromDateSchema>, PatternMessage>;
		shifts: Pick<
			RosterShift,
			'id' | 'code' | 'nameEn' | 'nameAr' | 'colour' | 'startTime' | 'endTime' | 'active'
		>[];
		today: string;
		open: boolean;
	};

	let { data, shifts, today, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			// `slots` holds `null` (off).
			dataType: 'json',
			validators: zod4Client(editFromDateSchema),
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') {
					toast.success(form.message.text);
					open = false;
					// The copy now carries the followers: open it.
					void goto(localizedHref('/patterns/[id]', { id: form.data.patternId }));
				} else if (form.message?.kind === 'error') {
					toast.error(form.message.text);
				}
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed } = form;
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto sm:max-w-xl">
		<Sheet.Header>
			<Sheet.Title>{m.patterns_edit_from_date()}</Sheet.Title>
			<Sheet.Description>{m.patterns_edit_from_date_description()}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/editFromDate" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<Form.Fieldset {form} name="slots">
				<Form.Legend>{m.roster_field_cycle()}</Form.Legend>
				<CycleEditor bind:value={$formData.slots} type={$formData.type} {shifts} />
				<Form.FieldErrors />
			</Form.Fieldset>

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="nameEn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.patterns_field_name_en()}</Form.Label>
							<Input {...props} bind:value={$formData.nameEn} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="nameAr">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.patterns_field_name_ar()}</Form.Label>
							<Input {...props} bind:value={$formData.nameAr} dir="rtl" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<Form.Field {form} name="effectiveFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_effective_from()}</Form.Label>
						<Input {...props} type="date" min={today} bind:value={$formData.effectiveFrom} />
					{/snippet}
				</Form.Control>
				<Form.Description>{m.patterns_edit_from_date_hint()}</Form.Description>
				<Form.FieldErrors />
			</Form.Field>

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
				{m.patterns_edit_from_date_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
