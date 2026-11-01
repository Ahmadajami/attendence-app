<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { ProfileMessage, skillFormSchema } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileSkill, StaffListOption } from '#lib/types/profile.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { levelLabel } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';
	import SkillForm from './SkillForm.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof skillFormSchema>, ProfileMessage>;
		skills: ProfileSkill[];
		/** Active skills, plus inactive ones the person has. */
		options: StaffListOption[];
	};

	let { data, skills, options }: Props = $props();

	let editing = $state<ProfileSkill | null>(null);
	/** A skill is given once: offer the active ones the person doesn't hold. */
	const addable = $derived(
		options.filter((o) => o.active && !skills.some((s) => s.skillId === o.id))
	);
</script>

<div class="grid gap-8 lg:grid-cols-2">
	<div class="flex flex-col gap-2">
		{#if skills.length === 0}
			<p class="text-sm text-muted-foreground">{m.profile_skills_empty()}</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each skills as skill (skill.id)}
					<li class="flex items-center justify-between gap-2 text-sm">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{lookupName(skill)}</span>
							{#if skill.level}
								<Badge variant="secondary">{levelLabel(skill.level)}</Badge>
							{/if}
						</div>
						<div class="flex">
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.profile_edit_item({ name: lookupName(skill) })}
								onclick={() => (editing = skill)}
							>
								<PencilSimpleIcon />
							</Button>
							<RemoveItemButton
								kind="skill"
								itemId={skill.id}
								label={m.profile_remove_item({ name: lookupName(skill) })}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<SkillForm {data} options={addable} {editing} onDone={() => (editing = null)} />
</div>
