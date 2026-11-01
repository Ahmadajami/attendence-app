<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import StarIcon from 'phosphor-svelte/lib/StarIcon';
	import { getStaffLists } from '#lib/app/staff-lists/context.js';
	import { manageLabel } from '#lib/app/staff-lists/labels.js';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { ProfileMessage, skillFormSchema } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileSkill, StaffListOption } from '#lib/types/profile.js';
	import { lookupName } from '#lib/utils/locale.js';
	import FormSheet from './FormSheet.svelte';
	import { levelLabel } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';
	import SkillForm from './SkillForm.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof skillFormSchema>, ProfileMessage>;
		skills: ProfileSkill[];
		/** The whole skill list, active and inactive. */
		list: StaffListOption[];
		/** The person's name, for the sheet's description. */
		name: string;
	};

	let { data, skills, list, name }: Props = $props();

	const lists = getStaffLists();
	let open = $state(false);
	let editing = $state<ProfileSkill | null>(null);

	/** A skill is given once: offer the ones the person doesn't hold (plus the edited one). */
	const options = $derived(
		list.filter((o) => o.id === editing?.skillId || !skills.some((s) => s.skillId === o.id))
	);

	function openForm(skill: ProfileSkill | null) {
		editing = skill;
		open = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_skills_title()}</Card.Title>
		<Card.Action class="flex flex-wrap justify-end gap-2">
			<Button variant="ghost" size="sm" onclick={() => lists.manage('skill')}>
				<ListChecksIcon data-icon="inline-start" />
				{manageLabel('skill')}
			</Button>
			<Button variant="outline" size="sm" onclick={() => openForm(null)}>
				<PlusIcon data-icon="inline-start" />
				{m.profile_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if skills.length === 0}
			<Empty icon={StarIcon} title={m.profile_skills_empty()} />
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
								onclick={() => openForm(skill)}
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
	</Card.Content>
</Card.Root>

<FormSheet
	title={editing ? m.profile_skill_edit() : m.profile_skill_add()}
	description={name}
	bind:open
>
	<SkillForm {data} {options} {editing} onDone={() => (open = false)} />
</FormSheet>
