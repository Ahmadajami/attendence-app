<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		SKILL_LEVELS,
		skillFormSchema,
		type ProfileMessage
	} from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileSkill, StaffListOption } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { levelLabel } from './labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof skillFormSchema>, ProfileMessage>;
		/** Skills the person can be given (active, not held yet). */
		options: StaffListOption[];
		/** The held skill whose level is edited; `null` adds one. */
		editing: ProfileSkill | null;
		/** After a save or a cancel: stop editing. */
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

	const selected = $derived(options.find((s) => s.id === $formData.skillId));
	const skillName = $derived(
		editing ? lookupName(editing) : selected ? lookupName(selected) : m.profile_skill_placeholder()
	);
	const levelValue = $derived($formData.level || 'none');
</script>

<form method="POST" action="?/saveSkill" class="flex flex-col gap-4" use:enhance>
	<h4 class="font-medium">{editing ? m.profile_skill_edit() : m.profile_skill_add()}</h4>
	<input type="hidden" name="staffSkillId" value={$formData.staffSkillId} />

	<Form.Field {form} name="skillId">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_skill()}</Form.Label>
				<!-- Posted from here: the select is disabled while a held skill's level is edited. -->
				<input type="hidden" name={props.name} value={$formData.skillId} />
				<Select.Root type="single" bind:value={$formData.skillId} disabled={editing !== null}>
					<Select.Trigger {...props} class="w-full">
						{skillName}
					</Select.Trigger>
					<Select.Content>
						{#each options as option (option.id)}
							<Select.Item value={option.id} label={lookupName(option)} />
						{/each}
					</Select.Content>
				</Select.Root>
			{/snippet}
		</Form.Control>
		{#if !editing && options.length === 0}
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

	<div class="flex gap-2">
		<Form.Button class="flex-1" disabled={$delayed}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{editing ? m.profile_save() : m.profile_add()}
		</Form.Button>
		{#if editing}
			<Button type="button" variant="outline" onclick={onDone}>{m.profile_cancel()}</Button>
		{/if}
	</div>
</form>
