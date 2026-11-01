<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import ListSelect from '#lib/app/staff-lists/ListSelect.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { ID_DIGITS } from '#lib/schemas/auth.schema.js';
	import { staffFormSchema, type StaffMessage } from '#lib/schemas/staff.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import type { DepartmentOption, StaffFunctionOption, TeamOption } from '#lib/types/workforce.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName, teamName } from '#lib/utils/locale.js';
	import { displayName } from '#lib/workforce/profile.js';

	type Props = {
		data: SuperValidated<Infer<typeof staffFormSchema>, StaffMessage>;
		/** `create`: the `/employees/new` page (cards, Cancel); `edit`: inside a sheet. */
		mode: 'create' | 'edit';
		/** The form action, e.g. `?/save`. */
		action: string;
		functions: StaffFunctionOption[];
		departments: DepartmentOption[];
		teams: TeamOption[];
		/** All job titles; the picker offers the active ones and the chosen one. */
		jobTitles: StaffListOption[];
		/** After a successful save (the toast is already shown). */
		onSaved?: (message: StaffMessage) => void;
		/** Above the form, with the typed name in the current language (`''` while empty). */
		header?: Snippet<[string]>;
	};

	let { data, mode, action, functions, departments, teams, jobTitles, onSaved, header }: Props =
		$props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(staffFormSchema),
			...statusToasts<Infer<typeof staffFormSchema>, StaffMessage>((message) => onSaved?.(message))
		}
	);
	const { form: formData, message, enhance, delayed } = form;

	/**
	 * Name parts for a new person and for one who has them; a person without parts (seeded) still
	 * edits the full names (profile plan H1). Decided once, from the values the form opened with.
	 */
	const useParts = untrack(
		() => mode === 'create' || data.data.firstNameEn !== '' || data.data.firstNameAr !== ''
	);

	const typedName = $derived.by(() => {
		const en = displayName($formData.firstNameEn, $formData.lastNameEn) ?? $formData.fullName;
		const ar = displayName($formData.firstNameAr, $formData.lastNameAr) ?? $formData.fullNameAr;
		return getLocale() === 'ar' ? ar || en : en || ar;
	});

	const teamValue = $derived($formData.teamId || 'none');
	const departmentValue = $derived($formData.departmentId || 'none');
	const functionValue = $derived($formData.functionId || 'none');

	function digitsOnly(event: InputEvent) {
		const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
		if (text && !ID_DIGITS.test(text)) event.preventDefault();
	}
</script>

<form method="POST" {action} class="flex flex-col gap-4" use:enhance>
	<input type="hidden" name="staffId" value={$formData.staffId} />

	{@render header?.(typedName)}

	{#if mode === 'create'}
		<Card.Root>
			<Card.Content class="flex flex-col gap-6">
				{@render sections()}
			</Card.Content>
		</Card.Root>
		<p class="text-sm text-muted-foreground">{m.employee_new_after_save()}</p>
		{@render errorText()}
		<div class="flex flex-wrap justify-end gap-2">
			<Button href={localizedHref('/employees')} variant="outline">{m.employee_new_cancel()}</Button
			>
			{@render submit(m.employee_new_submit())}
		</div>
	{:else}
		<div class="flex flex-col gap-6">
			{@render sections()}
		</div>
		{@render errorText()}
		{@render submit(m.staff_save(), 'w-full')}
	{/if}
</form>

{#snippet sections()}
	<section class="flex flex-col gap-4">
		<h3 class="font-medium">{m.employee_new_section_identity()}</h3>
		<Form.Field {form} name="employeeNo">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.staff_field_employee_no()}</Form.Label>
					<Input
						{...props}
						bind:value={$formData.employeeNo}
						inputmode="numeric"
						autocomplete="off"
						dir="ltr"
						placeholder={mode === 'create' ? m.staff_employee_no_generated() : undefined}
						onbeforeinput={digitsOnly}
					/>
				{/snippet}
			</Form.Control>
			{#if mode === 'create'}
				<Form.Description>{m.staff_employee_no_hint()}</Form.Description>
			{/if}
			<Form.FieldErrors />
		</Form.Field>

		{#if useParts}
			<!-- The full names follow the parts; posted as they are for a language left empty. -->
			<input type="hidden" name="fullName" value={$formData.fullName} />
			<input type="hidden" name="fullNameAr" value={$formData.fullNameAr} />
			<div class="grid gap-4 sm:grid-cols-2">
				{@render textField('firstNameEn', m.profile_field_first_name_en(), 'ltr')}
				{@render textField('lastNameEn', m.profile_field_last_name_en(), 'ltr')}
				{@render textField('firstNameAr', m.profile_field_first_name_ar(), 'rtl')}
				{@render textField('lastNameAr', m.profile_field_last_name_ar(), 'rtl')}
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2">
				{@render textField('fullName', m.staff_field_full_name(), 'ltr')}
				{@render textField('fullNameAr', m.staff_field_full_name_ar(), 'rtl')}
			</div>
			<p class="text-sm text-muted-foreground">{m.staff_name_parts_hint()}</p>
		{/if}
	</section>

	<Separator />

	<section class="flex flex-col gap-4">
		<h3 class="font-medium">{m.employee_new_section_job()}</h3>
		<Form.Field {form} name="jobTitleId">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.profile_field_job_title()}</Form.Label>
					<!-- The picker's placeholder items are never posted: post '' or an id. -->
					<input type="hidden" name={props.name} value={$formData.jobTitleId} />
					<ListSelect
						{...props}
						bind:value={$formData.jobTitleId}
						items={jobTitles}
						kind="job_title"
						placeholder={m.profile_no_job_title()}
						allowNone
						noneLabel={m.profile_no_job_title()}
					/>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field {form} name="departmentId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_field_department()}</Form.Label>
						<!-- "No department" is the `none` item only inside the select; post '' or an id. -->
						<input type="hidden" name={props.name} value={$formData.departmentId} />
						<Select.Root
							type="single"
							value={departmentValue}
							onValueChange={(value) => ($formData.departmentId = value === 'none' ? '' : value)}
						>
							<Select.Trigger {...props} class="w-full">
								{departmentValue === 'none'
									? m.staff_no_department()
									: lookupName(departments.find((d) => d.id === departmentValue) ?? departments[0])}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="none" label={m.staff_no_department()} />
								{#each departments as dept (dept.id)}
									<Select.Item value={dept.id} label={lookupName(dept)} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="functionId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_field_function()}</Form.Label>
						<input type="hidden" name={props.name} value={$formData.functionId} />
						<Select.Root
							type="single"
							value={functionValue}
							onValueChange={(value) => ($formData.functionId = value === 'none' ? '' : value)}
						>
							<Select.Trigger {...props} class="w-full">
								{functionValue === 'none'
									? m.staff_no_function()
									: lookupName(functions.find((f) => f.id === functionValue) ?? functions[0])}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="none" label={m.staff_no_function()} />
								{#each functions as fn (fn.id)}
									<Select.Item value={fn.id} label={lookupName(fn)} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</div>

		<Form.Field {form} name="teamId">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.staff_field_team()}</Form.Label>
					<!-- "No team" is the `none` item only inside the select; post '' or an id. -->
					<input type="hidden" name={props.name} value={$formData.teamId} />
					<Select.Root
						type="single"
						value={teamValue}
						onValueChange={(value) => ($formData.teamId = value === 'none' ? '' : value)}
					>
						<Select.Trigger {...props} class="w-full">
							{teamValue === 'none'
								? m.employees_no_team()
								: teamName(teams.find((t) => t.id === teamValue) ?? teams[0])}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="none" label={m.employees_no_team()} />
							{#each teams as team (team.id)}
								<Select.Item value={team.id} label={teamName(team)} />
							{/each}
						</Select.Content>
					</Select.Root>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	</section>

	<Separator />

	<section class="flex flex-col gap-4">
		<h3 class="font-medium">{m.employee_new_section_contact()}</h3>
		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field {form} name="phone">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_field_phone()}</Form.Label>
						<Input
							{...props}
							bind:value={$formData.phone}
							type="tel"
							dir="ltr"
							autocomplete="off"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="workEmail">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_field_work_email()}</Form.Label>
						<Input
							{...props}
							bind:value={$formData.workEmail}
							type="email"
							dir="ltr"
							autocomplete="off"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</div>
	</section>

	<Separator />

	<section class="flex flex-col gap-4">
		<h3 class="font-medium">{m.employee_new_section_dates()}</h3>
		<Form.Field {form} name="startDate" class="sm:max-w-[calc(50%-0.5rem)]">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{m.staff_field_start_date()}</Form.Label>
					<Input {...props} bind:value={$formData.startDate} type="date" dir="ltr" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
	</section>
{/snippet}

{#snippet textField(
	name: 'firstNameEn' | 'lastNameEn' | 'firstNameAr' | 'lastNameAr' | 'fullName' | 'fullNameAr',
	label: string,
	dir: 'ltr' | 'rtl'
)}
	<Form.Field {form} {name}>
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{label}</Form.Label>
				<Input {...props} bind:value={$formData[name]} {dir} autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
{/snippet}

{#snippet errorText()}
	{#if $message?.kind === 'error'}
		<p class="text-sm text-destructive" role="alert">{$message.text}</p>
	{/if}
{/snippet}

{#snippet submit(label: string, className?: string)}
	<Form.Button class={className} disabled={$delayed}>
		{#if $delayed}
			<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
		{/if}
		{label}
	</Form.Button>
{/snippet}
