<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import ListSelect from '#lib/app/staff-lists/ListSelect.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import {
		SKILL_LEVELS,
		skillFormSchema,
		type ProfileMessage
	} from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileSkill, StaffListOption } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { levelLabel } from './labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof skillFormSchema>, ProfileMessage>;
		/** Every skill except the ones the person holds (the edited one stays). */
		options: StaffListOption[];
		/** The held skill whose level is edited; `null` adds one. */
		editing: ProfileSkill | null;
		/** After a save: close the sheet. */
		onDone: () => void;
	};

	let { data, options, editing, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(skillFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.staffSkillId = editing?.id ?? '';
		$formData.skillId = editing?.skillId ?? '';
		$formData.level = editing?.level ? (String(editing.level) as '1' | '2' | '3') : '';
	});

	/** Nothing left to give: only "New skill" is in the picker. */
	const noneLeft = $derived(!editing && !options.some((s) => s.active));
	const levelValue = $derived($formData.level || 'none');
</script>

<form method="POST" action="?/saveSkill" class="flex flex-col gap-4" use:enhance>
	<input type="hidden" name="staffSkillId" value={$formData.staffSkillId} />

	<Form.Field {form} name="skillId">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_skill()}</Form.Label>
				<!-- Posted from here: the picker is disabled while a held skill's level is edited. -->
				<input type="hidden" name={props.name} value={$formData.skillId} />
				<ListSelect
					{...props}
					bind:value={$formData.skillId}
					items={options}
					kind="skill"
					placeholder={m.profile_skill_placeholder()}
					disabled={editing !== null}
				/>
			{/snippet}
		</Form.Control>
		{#if noneLeft}
			<Form.Description>{m.profile_skill_no_options()}</Form.Description>
		{/if}
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="level">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_level()}</Form.Label>
				<!-- "No level" is the `none` item only inside the select; post '' or 1–3. -->
				<input type="hidden" name={props.name} value={$formData.level} />
				<Select.Root
					type="single"
					value={levelValue}
					onValueChange={(value) =>
						($formData.level = value === 'none' ? '' : (value as '1' | '2' | '3'))}
				>
					<Select.Trigger {...props} class="w-full">
						{levelLabel(levelValue === 'none' ? null : levelValue)}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="none" label={m.profile_skill_no_level()} />
						{#each SKILL_LEVELS as level (level)}
							<Select.Item value={level} label={levelLabel(level)} />
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
		{editing ? m.profile_save() : m.profile_add()}
	</Form.Button>
</form>
