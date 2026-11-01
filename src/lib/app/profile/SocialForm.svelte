<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		SOCIAL_PLATFORMS,
		socialFormSchema,
		type ProfileMessage,
		type SocialPlatform
	} from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileSocial } from '#lib/types/profile.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { platformLabel } from './labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof socialFormSchema>, ProfileMessage>;
		/** The account being edited; `null` adds one. */
		editing: ProfileSocial | null;
		/** After a save or a cancel: stop editing. */
		onDone: () => void;
	};

	let { data, editing, onDone }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(socialFormSchema),
			...statusToasts(() => onDone())
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.socialId = editing?.id ?? '';
		// An unknown stored platform is edited as "other".
		$formData.platform = editing
			? SOCIAL_PLATFORMS.includes(editing.platform as SocialPlatform)
				? (editing.platform as SocialPlatform)
				: 'other'
			: ('' as SocialPlatform);
		$formData.handle = editing?.handle ?? '';
	});
</script>

<form method="POST" action="?/saveSocial" class="flex flex-col gap-4" use:enhance>
	<h4 class="font-medium">{editing ? m.profile_social_edit() : m.profile_social_add()}</h4>
	<input type="hidden" name="socialId" value={$formData.socialId} />

	<Form.Field {form} name="platform">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_platform()}</Form.Label>
				<Select.Root type="single" name={props.name} bind:value={$formData.platform}>
					<Select.Trigger {...props} class="w-full">
						{$formData.platform
							? platformLabel($formData.platform)
							: m.profile_platform_placeholder()}
					</Select.Trigger>
					<Select.Content>
						{#each SOCIAL_PLATFORMS as platform (platform)}
							<Select.Item value={platform} label={platformLabel(platform)} />
						{/each}
					</Select.Content>
				</Select.Root>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>

	<Form.Field {form} name="handle">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>{m.profile_field_handle()}</Form.Label>
				<Input {...props} bind:value={$formData.handle} dir="ltr" autocomplete="off" />
			{/snippet}
		</Form.Control>
		<Form.Description>{m.profile_handle_hint()}</Form.Description>
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
