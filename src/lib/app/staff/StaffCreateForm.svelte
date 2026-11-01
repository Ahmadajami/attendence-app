<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CircleIcon from 'phosphor-svelte/lib/CircleIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';
	import FieldLabel from '#lib/app/forms/FieldLabel.svelte';
	import ListSelect from '#lib/app/staff-lists/ListSelect.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { ID_DIGITS } from '#lib/schemas/auth.schema.js';
	import {
		STAFF_CREATE_REQUIRED,
		staffCreateFormSchema,
		type StaffCreateRequiredField,
		type StaffMessage
	} from '#lib/schemas/staff.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import type { DepartmentOption, StaffFunctionOption, TeamOption } from '#lib/types/workforce.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName, teamName } from '#lib/utils/locale.js';
	import { displayName, initials } from '#lib/workforce/profile.js';

	type Props = {
		data: SuperValidated<Infer<typeof staffCreateFormSchema>, StaffMessage>;
		functions: StaffFunctionOption[];
		departments: DepartmentOption[];
		teams: TeamOption[];
		/** All job titles; the picker offers the active ones. */
		jobTitles: StaffListOption[];
		/** After a successful save (the toast is already shown). */
		onSaved?: (message: StaffMessage) => void;
	};

	let { data, functions, departments, teams, jobTitles, onSaved }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(staffCreateFormSchema),
			...statusToasts<Infer<typeof staffCreateFormSchema>, StaffMessage>((message) =>
				onSaved?.(message)
			)
		}
	);
	const { form: formData, message, enhance, delayed } = form;

	type TextName =
		| 'firstNameEn'
		| 'lastNameEn'
		| 'firstNameAr'
		| 'lastNameAr'
		| 'fatherNameEn'
		| 'fatherNameAr'
		| 'motherNameEn'
		| 'motherNameAr'
		| 'nationalIdNo'
		| 'passportNo';
	type DateName = 'nationalIdIssuedOn' | 'nationalIdExpiresOn' | 'startDate';
	type ContactName = 'phone' | 'workEmail' | 'personalEmail';

	const isRequired = (name: string) =>
		(STAFF_CREATE_REQUIRED as readonly string[]).includes(name);
	/** Ids for the inputs, so the checklist can move the focus to a missing field. */
	const fieldId = (name: string) => `staff-create-${name}`;

	const requiredLabel: Record<StaffCreateRequiredField, () => string> = {
		firstNameEn: m.profile_field_first_name_en,
		lastNameEn: m.profile_field_last_name_en,
		firstNameAr: m.profile_field_first_name_ar,
		lastNameAr: m.profile_field_last_name_ar,
		nationalIdNo: m.profile_field_national_id_no,
		startDate: m.staff_field_start_date
	};
	const checklist = $derived(
		STAFF_CREATE_REQUIRED.map((name) => ({
			name,
			label: requiredLabel[name](),
			done: $formData[name].trim() !== ''
		}))
	);
	const doneCount = $derived(checklist.filter((item) => item.done).length);

	function focusField(name: string) {
		document.getElementById(fieldId(name))?.focus();
	}

	/** The name in the current language, for the avatar (`''` while empty). */
	const typedName = $derived.by(() => {
		const en = displayName($formData.firstNameEn, $formData.lastNameEn) ?? '';
		const ar = displayName($formData.firstNameAr, $formData.lastNameAr) ?? '';
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

<!-- Add an employee (create plan C1–C3): sections on one page, a "required fields" checklist and
     a save bar that stays in view. Required fields carry *, the others "(optional)". -->
<form method="POST" action="?/save" class="flex flex-col gap-4" use:enhance>
	<Card.Root>
		<Card.Content class="flex items-center gap-4">
			<Avatar.Root class="size-16">
				<Avatar.Fallback class="text-lg font-medium">
					{#if typedName}
						{initials(typedName)}
					{:else}
						<UserIcon class="size-6" />
					{/if}
				</Avatar.Fallback>
			</Avatar.Root>
			<div class="flex min-w-0 flex-col gap-1">
				<h2 class="text-2xl font-semibold tracking-tight">{m.employee_new_title()}</h2>
				<p class="truncate text-muted-foreground">
					{typedName || m.employee_new_description()}
				</p>
			</div>
		</Card.Content>
	</Card.Root>

	<p class="text-sm text-muted-foreground">{m.employee_new_required_legend()}</p>

	<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
		<div class="flex flex-col gap-4">
			<!-- 1. Identity -->
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.employee_new_section_identity()}</Card.Title>
					<Card.Description>{m.employee_new_identity_hint()}</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						{@render textField('firstNameEn', m.profile_field_first_name_en(), 'ltr')}
						{@render textField('lastNameEn', m.profile_field_last_name_en(), 'ltr')}
						{@render textField('firstNameAr', m.profile_field_first_name_ar(), 'rtl')}
						{@render textField('lastNameAr', m.profile_field_last_name_ar(), 'rtl')}
					</div>
					<Form.Field {form} name="employeeNo" class="sm:max-w-[calc(50%-0.5rem)]">
						<Form.Control id={fieldId('employeeNo')}>
							{#snippet children({ props })}
								<FieldLabel required={false}>{m.staff_field_employee_no()}</FieldLabel>
								<Input
									{...props}
									bind:value={$formData.employeeNo}
									inputmode="numeric"
									autocomplete="off"
									dir="ltr"
									placeholder={m.staff_employee_no_generated()}
									onbeforeinput={digitsOnly}
								/>
							{/snippet}
						</Form.Control>
						<Form.Description>{m.staff_employee_no_hint()}</Form.Description>
						<Form.FieldErrors />
					</Form.Field>
				</Card.Content>
			</Card.Root>

			<!-- 2. Family & ID -->
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.profile_identity_title()}</Card.Title>
					<Card.Description>{m.employee_new_family_hint()}</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						{@render textField('nationalIdNo', m.profile_field_national_id_no(), 'ltr')}
						{@render textField('passportNo', m.profile_field_passport_no(), 'ltr')}
						{@render dateField('nationalIdIssuedOn', m.profile_field_national_id_issued_on())}
						{@render dateField('nationalIdExpiresOn', m.profile_field_national_id_expires_on())}
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						{@render textField('fatherNameEn', m.profile_field_father_name_en(), 'ltr')}
						{@render textField('fatherNameAr', m.profile_field_father_name_ar(), 'rtl')}
						{@render textField('motherNameEn', m.profile_field_mother_name_en(), 'ltr')}
						{@render textField('motherNameAr', m.profile_field_mother_name_ar(), 'rtl')}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- 3. Job -->
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.employee_new_section_job()}</Card.Title>
					<Card.Description>{m.employee_new_job_hint()}</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						{@render dateField('startDate', m.staff_field_start_date())}

						<Form.Field {form} name="jobTitleId">
							<Form.Control id={fieldId('jobTitleId')}>
								{#snippet children({ props })}
									<FieldLabel required={false}>{m.profile_field_job_title()}</FieldLabel>
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

						<Form.Field {form} name="departmentId">
							<Form.Control id={fieldId('departmentId')}>
								{#snippet children({ props })}
									<FieldLabel required={false}>{m.staff_field_department()}</FieldLabel>
									<!-- "No department" is the `none` item only inside the select; post '' or an id. -->
									<input type="hidden" name={props.name} value={$formData.departmentId} />
									<Select.Root
										type="single"
										value={departmentValue}
										onValueChange={(value) =>
											($formData.departmentId = value === 'none' ? '' : value)}
									>
										<Select.Trigger {...props} class="w-full">
											{departmentValue === 'none'
												? m.staff_no_department()
												: lookupName(
														departments.find((d) => d.id === departmentValue) ?? departments[0]
													)}
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

						<Form.Field {form} name="teamId">
							<Form.Control id={fieldId('teamId')}>
								{#snippet children({ props })}
									<FieldLabel required={false}>{m.staff_field_team()}</FieldLabel>
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

						<Form.Field {form} name="functionId">
							<Form.Control id={fieldId('functionId')}>
								{#snippet children({ props })}
									<FieldLabel required={false}>{m.staff_field_function()}</FieldLabel>
									<input type="hidden" name={props.name} value={$formData.functionId} />
									<Select.Root
										type="single"
										value={functionValue}
										onValueChange={(value) =>
											($formData.functionId = value === 'none' ? '' : value)}
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
				</Card.Content>
			</Card.Root>

			<!-- 4. Contact -->
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.employee_new_section_contact()}</Card.Title>
					<Card.Description>{m.employee_new_contact_hint()}</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-4 sm:grid-cols-2">
					{@render contactField('phone', m.staff_field_phone(), 'tel')}
					{@render contactField('workEmail', m.staff_field_work_email(), 'email')}
					{@render contactField('personalEmail', m.profile_field_personal_email(), 'email')}
				</Card.Content>
			</Card.Root>

			<p class="text-sm text-muted-foreground">{m.employee_new_after_save()}</p>
		</div>

		<!-- What is still missing; a click moves to the field. -->
		<Card.Root size="sm" class="lg:sticky lg:top-4">
			<Card.Header>
				<Card.Title>{m.employee_new_required_title()}</Card.Title>
				<Card.Description>
					{m.employee_new_required_progress({ done: doneCount, total: checklist.length })}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-col gap-1">
					{#each checklist as item (item.name)}
						<li>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class={[
									'w-full justify-start',
									item.done ? 'text-muted-foreground' : 'text-foreground'
								]}
								onclick={() => focusField(item.name)}
							>
								{#if item.done}
									<CheckCircleIcon data-icon="inline-start" weight="fill" class="text-primary" />
								{:else}
									<CircleIcon data-icon="inline-start" class="text-destructive" />
								{/if}
								{item.label}
							</Button>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	</div>

	{#if $message?.kind === 'error'}
		<p class="text-sm text-destructive" role="alert">{$message.text}</p>
	{/if}

	<!-- Save bar: stays at the bottom of the screen while scrolling. -->
	<div
		class="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3"
	>
		<p class="me-auto text-sm text-muted-foreground">
			{doneCount === checklist.length
				? m.employee_new_required_all_done()
				: m.employee_new_required_progress({ done: doneCount, total: checklist.length })}
		</p>
		<Button href={localizedHref('/employees')} variant="outline">{m.employee_new_cancel()}</Button>
		<Form.Button disabled={$delayed}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{m.employee_new_submit()}
		</Form.Button>
	</div>
</form>

{#snippet textField(name: TextName, label: string, dir: 'ltr' | 'rtl')}
	<Form.Field {form} {name}>
		<Form.Control id={fieldId(name)}>
			{#snippet children({ props })}
				<FieldLabel required={isRequired(name)}>{label}</FieldLabel>
				<Input
					{...props}
					bind:value={$formData[name]}
					{dir}
					autocomplete="off"
					aria-required={isRequired(name)}
				/>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
{/snippet}

{#snippet dateField(name: DateName, label: string)}
	<Form.Field {form} {name}>
		<Form.Control id={fieldId(name)}>
			{#snippet children({ props })}
				<FieldLabel required={isRequired(name)}>{label}</FieldLabel>
				<Input
					{...props}
					bind:value={$formData[name]}
					type="date"
					dir="ltr"
					aria-required={isRequired(name)}
				/>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
{/snippet}

{#snippet contactField(name: ContactName, label: string, type: 'tel' | 'email')}
	<Form.Field {form} {name}>
		<Form.Control id={fieldId(name)}>
			{#snippet children({ props })}
				<FieldLabel required={false}>{label}</FieldLabel>
				<Input {...props} bind:value={$formData[name]} {type} dir="ltr" autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
{/snippet}
