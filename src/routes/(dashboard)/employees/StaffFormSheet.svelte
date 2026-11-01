<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { ID_DIGITS } from '#lib/schemas/auth.schema.js';
	import type {
		DepartmentOption,
		JobTitleOption,
		StaffFunctionOption,
		StaffRow,
		TeamOption
	} from '#lib/types/workforce.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide, lookupName, personName, teamName } from '#lib/utils/locale.js';
	import { staffFormSchema, type StaffMessage } from './schema.js';

	type Props = {
		data: SuperValidated<Infer<typeof staffFormSchema>, StaffMessage>;
		target: StaffRow | null;
		functions: StaffFunctionOption[];
		departments: DepartmentOption[];
		teams: TeamOption[];
		/** Active job titles. */
		jobTitles: JobTitleOption[];
		open: boolean;
	};

	let {
		data,
		target,
		functions,
		departments,
		teams,
		jobTitles,
		open = $bindable()
	}: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(staffFormSchema),
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, message, enhance, delayed } = form;

	$effect(() => {
		$formData.staffId = target?.id ?? '';
		$formData.employeeNo = target?.employeeNo ?? '';
		$formData.firstNameEn = target?.firstNameEn ?? '';
		$formData.lastNameEn = target?.lastNameEn ?? '';
		$formData.firstNameAr = target?.firstNameAr ?? '';
		$formData.lastNameAr = target?.lastNameAr ?? '';
		$formData.fullName = target?.fullName ?? '';
		$formData.fullNameAr = target?.fullNameAr ?? '';
		$formData.jobTitleId = target?.jobTitle?.id ?? '';
		$formData.phone = target?.phone ?? '';
		$formData.workEmail = target?.workEmail ?? '';
		$formData.startDate = target?.startDate ?? '';
		$formData.functionId = target?.function?.id ?? '';
		$formData.departmentId = target?.department?.id ?? '';
		$formData.teamId = target?.team?.id ?? '';
	});

	const teamValue = $derived($formData.teamId || 'none');
	const departmentValue = $derived($formData.departmentId || 'none');
	const functionValue = $derived($formData.functionId || 'none');
	const jobTitleValue = $derived($formData.jobTitleId || 'none');
	/** The active titles, plus an inactive one the person still has. */
	const jobTitleOptions = $derived(
		target?.jobTitle && !jobTitles.some((t) => t.id === target.jobTitle?.id)
			? [...jobTitles, target.jobTitle]
			: jobTitles
	);

	/**
	 * Name parts for a new person and for one who has them; a person without parts (seeded) still
	 * edits the full names (profile plan H1).
	 */
	const useParts = $derived(!target || target.firstNameEn !== null || target.firstNameAr !== null);

	function digitsOnly(event: InputEvent) {
		const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
		if (text && !ID_DIGITS.test(text)) event.preventDefault();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{target ? m.staff_edit() : m.staff_new()}</Sheet.Title>
			<Sheet.Description>
				{target
					? m.staff_edit_description({ name: personName(target) })
					: m.staff_create_description()}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/save" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="staffId" value={$formData.staffId} />

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
							placeholder={target ? undefined : m.staff_employee_no_generated()}
							onbeforeinput={digitsOnly}
						/>
					{/snippet}
				</Form.Control>
				{#if !target}
					<Form.Description>{m.staff_employee_no_hint()}</Form.Description>
				{/if}
				<Form.FieldErrors />
			</Form.Field>

			{#if useParts}
				<!-- The full names follow the parts; posted as they are for a language left empty. -->
				<input type="hidden" name="fullName" value={$formData.fullName} />
				<input type="hidden" name="fullNameAr" value={$formData.fullNameAr} />
				<div class="grid grid-cols-2 gap-4">
					{@render textField('firstNameEn', m.profile_field_first_name_en(), 'ltr')}
					{@render textField('lastNameEn', m.profile_field_last_name_en(), 'ltr')}
					{@render textField('firstNameAr', m.profile_field_first_name_ar(), 'rtl')}
					{@render textField('lastNameAr', m.profile_field_last_name_ar(), 'rtl')}
				</div>
			{:else}
				{@render textField('fullName', m.staff_field_full_name(), 'ltr')}
				{@render textField('fullNameAr', m.staff_field_full_name_ar(), 'rtl')}
				<p class="text-sm text-muted-foreground">{m.staff_name_parts_hint()}</p>
			{/if}

			<Form.Field {form} name="jobTitleId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.profile_field_job_title()}</Form.Label>
						<input type="hidden" name={props.name} value={$formData.jobTitleId} />
						<Select.Root
							type="single"
							value={jobTitleValue}
							onValueChange={(value) => ($formData.jobTitleId = value === 'none' ? '' : value)}
						>
							<Select.Trigger {...props} class="w-full">
								{jobTitleValue === 'none'
									? m.profile_no_job_title()
									: lookupName(
											jobTitleOptions.find((t) => t.id === jobTitleValue) ?? jobTitleOptions[0]
										)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="none" label={m.profile_no_job_title()} />
								{#each jobTitleOptions as title (title.id)}
									<Select.Item value={title.id} label={lookupName(title)} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="phone">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_field_phone()}</Form.Label>
						<Input {...props} bind:value={$formData.phone} dir="ltr" autocomplete="off" />
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

			<Form.Field {form} name="startDate">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_field_start_date()}</Form.Label>
						<Input {...props} bind:value={$formData.startDate} type="date" dir="ltr" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

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

			<Form.Field {form} name="teamId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.staff_field_team()}</Form.Label>
						<!-- "No team" is the `none` item only inside the select; post the real value ('' or an id). -->
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

			{#if $message?.kind === 'error'}
				<p class="text-sm text-destructive" role="alert">{$message.text}</p>
			{/if}

			<Form.Button class="w-full" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{target ? m.staff_save() : m.staff_create_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>

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
