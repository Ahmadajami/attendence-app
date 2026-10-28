<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { departmentFormSchema, type DepartmentMessage } from '#lib/schemas/departments.schema.js';
	import { descendantIds } from '#lib/workforce/departments.js';
	import { endSide, lookupName, personName } from '#lib/utils/locale.js';

	type Department = {
		id: string;
		nameEn: string;
		nameAr: string;
		parentId: string | null;
		managerStaffId: string | null;
		active: boolean;
		depth: number;
	};
	type Manager = { id: string; employeeNo: string; fullName: string; fullNameAr: string | null };

	type Props = {
		data: SuperValidated<Infer<typeof departmentFormSchema>, DepartmentMessage>;
		target: Department | null;
		departments: Department[];
		managers: Manager[];
		open: boolean;
	};

	let { data, target, departments, managers, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(departmentFormSchema),
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
		$formData.departmentId = target?.id ?? '';
		$formData.nameEn = target?.nameEn ?? '';
		$formData.nameAr = target?.nameAr ?? '';
		$formData.parentId = target?.parentId ?? '';
		$formData.managerStaffId = target?.managerStaffId ?? '';
	});

	/** Active departments, minus the edited one and everything below it (no cycles). */
	const parentOptions = $derived.by(() => {
		if (!target) return departments.filter((d) => d.active);
		const below = descendantIds(departments, target.id);
		return departments.filter((d) => d.active && d.id !== target.id && !below.has(d.id));
	});

	const parentValue = $derived($formData.parentId || 'none');
	const managerValue = $derived($formData.managerStaffId || 'none');

	function managerLabel(id: string) {
		const row = managers.find((s) => s.id === id);
		return row ? `${personName(row)} · ${row.employeeNo}` : m.departments_no_manager();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{target ? m.departments_edit() : m.departments_new()}</Sheet.Title>
			<Sheet.Description>
				{target
					? m.departments_edit_description({ name: lookupName(target) })
					: m.departments_create_description()}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/save" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="departmentId" value={$formData.departmentId} />

			<Form.Field {form} name="nameEn">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.departments_field_name_en()}</Form.Label>
						<Input {...props} bind:value={$formData.nameEn} dir="ltr" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="nameAr">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.departments_field_name_ar()}</Form.Label>
						<Input {...props} bind:value={$formData.nameAr} dir="rtl" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="parentId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.departments_field_parent()}</Form.Label>
						<!-- "Top level" is the `none` item only inside the select; post '' or an id. -->
						<input type="hidden" name={props.name} value={$formData.parentId} />
						<Select.Root
							type="single"
							value={parentValue}
							onValueChange={(value) => ($formData.parentId = value === 'none' ? '' : value)}
						>
							<Select.Trigger {...props} class="w-full">
								{parentValue === 'none'
									? m.departments_no_parent()
									: lookupName(
											departments.find((d) => d.id === parentValue) ?? {
												nameEn: '—',
												nameAr: '—'
											}
										)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="none" label={m.departments_no_parent()} />
								{#each parentOptions as dept (dept.id)}
									<Select.Item value={dept.id} label={lookupName(dept)}>
										<span style:padding-inline-start="{dept.depth * 0.75}rem">
											{lookupName(dept)}
										</span>
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="managerStaffId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.departments_field_manager()}</Form.Label>
						<input type="hidden" name={props.name} value={$formData.managerStaffId} />
						<Select.Root
							type="single"
							value={managerValue}
							onValueChange={(value) => ($formData.managerStaffId = value === 'none' ? '' : value)}
						>
							<Select.Trigger {...props} class="w-full">
								{managerValue === 'none' ? m.departments_no_manager() : managerLabel(managerValue)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="none" label={m.departments_no_manager()} />
								{#each managers as person (person.id)}
									<Select.Item value={person.id} label={managerLabel(person.id)} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button class="w-full" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{target ? m.departments_save() : m.departments_create_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
