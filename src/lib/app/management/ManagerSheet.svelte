<script lang="ts">
	import { untrack } from 'svelte';
	import { fieldProxy, superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { addDays } from '#lib/roster/cycle.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { earliestEffectiveDate } from '#lib/roster/backdate.js';
	import {
		departmentManagerFormSchema,
		type DepartmentManagerMessage
	} from '#lib/schemas/management.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide, lookupName, personName } from '#lib/utils/locale.js';

	type Person = { id: string; employeeNo: string; fullName: string; fullNameAr: string | null };
	type HistoryRow = {
		id: string;
		validFrom: string;
		validTo: string | null;
		reason: string;
		employeeNo: string;
		fullName: string;
		fullNameAr: string | null;
	};

	type Props = {
		data: SuperValidated<Infer<typeof departmentManagerFormSchema>, DepartmentManagerMessage>;
		/** Form action, e.g. `?/setManager`. */
		action: string;
		/** The department whose manager changes; `null` while the sheet is closed. */
		department: { id: string; nameEn: string; nameAr: string } | null;
		/** Its manager today, to preselect (`null`: none). */
		currentStaffId: string | null;
		/** Active employees who can be chosen. */
		people: Person[];
		/** The department's managers, newest first (M3). */
		history: HistoryRow[];
		today: string;
		open: boolean;
	};

	let {
		data,
		action,
		department,
		currentStaffId,
		people,
		history,
		today,
		open = $bindable()
	}: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(departmentManagerFormSchema),
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	// Filled when the sheet opens for a department: not user edits, so they don't taint the form.
	const departmentId = fieldProxy(form, 'departmentId', { taint: false });
	const staffId = fieldProxy(form, 'staffId', { taint: false });
	const validFrom = fieldProxy(form, 'validFrom', { taint: false });
	const reason = fieldProxy(form, 'reason', { taint: false });

	$effect(() => {
		if (!open || !department) return;
		const id = department.id;
		const current = currentStaffId ?? '';
		untrack(() => {
			departmentId.set(id);
			staffId.set(current);
			validFrom.set(today);
			reason.set('');
		});
	});

	/** "No manager" is only an item inside the select; the form posts '' (CLAUDE.md §3, Select). */
	const staffValue = $derived($formData.staffId || 'none');

	function personLabel(id: string): string {
		const person = people.find((p) => p.id === id);
		return person ? `${personName(person)} · ${person.employeeNo}` : m.departments_no_manager();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.management_change_manager()}</Sheet.Title>
			<Sheet.Description>
				{m.management_change_manager_description({
					name: department ? lookupName(department) : ''
				})}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" {action} class="flex flex-col gap-4 px-4" use:enhance>
			<input type="hidden" name="departmentId" value={$formData.departmentId} />

			<Form.Field {form} name="staffId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.departments_field_manager()}</Form.Label>
						<input type="hidden" name={props.name} value={$formData.staffId} />
						<Select.Root
							type="single"
							value={staffValue}
							onValueChange={(value) => ($formData.staffId = value === 'none' ? '' : value)}
						>
							<Select.Trigger {...props} class="w-full">
								{staffValue === 'none' ? m.departments_no_manager() : personLabel(staffValue)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="none" label={m.departments_no_manager()} />
								{#each people as person (person.id)}
									<Select.Item value={person.id} label={personLabel(person.id)} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.Description>{m.management_no_manager_hint()}</Form.Description>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="validFrom">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_effective_from()}</Form.Label>
						<Input
							{...props}
							type="date"
							min={earliestEffectiveDate(today)}
							bind:value={$formData.validFrom}
						/>
					{/snippet}
				</Form.Control>
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
				{m.management_change_manager_submit()}
			</Form.Button>
		</form>

		<Separator class="my-4" />

		<section class="flex flex-col gap-2 px-4 pb-4" aria-labelledby="manager-history-heading">
			<h3 id="manager-history-heading" class="text-sm font-medium">
				{m.management_history_title()}
			</h3>
			{#if history.length > 0}
				<ul class="flex flex-col gap-2">
					{#each history as row (row.id)}
						<li class="flex flex-col gap-0.5 text-sm">
							<span class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{personName(row)}</span>
								<bdi dir="ltr" class="font-mono text-xs text-muted-foreground">{row.employeeNo}</bdi
								>
								{#if row.validFrom <= today && (row.validTo === null || row.validTo > today)}
									<Badge variant="secondary">{m.management_history_current()}</Badge>
								{:else if row.validFrom > today}
									<Badge variant="outline">{m.management_history_scheduled()}</Badge>
								{/if}
							</span>
							<span class="text-xs text-muted-foreground">
								{row.validTo
									? m.management_history_range({
											from: formatCalendarDate(row.validFrom),
											to: formatCalendarDate(addDays(row.validTo, -1))
										})
									: m.management_history_since({ from: formatCalendarDate(row.validFrom) })}
								· {row.reason}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">{m.management_history_empty()}</p>
			{/if}
		</section>
	</Sheet.Content>
</Sheet.Root>
