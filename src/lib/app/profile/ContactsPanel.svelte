<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type {
		contactFormSchema,
		ProfileMessage,
		socialFormSchema
	} from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileContact, ProfileSocial } from '#lib/types/profile.js';
	import ContactForm from './ContactForm.svelte';
	import { platformLabel } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';
	import SocialForm from './SocialForm.svelte';

	type Props = {
		contactData: SuperValidated<Infer<typeof contactFormSchema>, ProfileMessage>;
		socialData: SuperValidated<Infer<typeof socialFormSchema>, ProfileMessage>;
		contacts: ProfileContact[];
		socials: ProfileSocial[];
	};

	let { contactData, socialData, contacts, socials }: Props = $props();

	let editingContact = $state<ProfileContact | null>(null);
	let editingSocial = $state<ProfileSocial | null>(null);
</script>

<div class="grid gap-8 lg:grid-cols-2">
	<section class="flex flex-col gap-3">
		<h3 class="font-semibold">{m.profile_emergency_contacts()}</h3>
		{#if contacts.length === 0}
			<p class="text-sm text-muted-foreground">{m.profile_contacts_empty()}</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each contacts as contact (contact.id)}
					<li class="flex items-start justify-between gap-2 text-sm">
						<div class="flex flex-col">
							<span class="font-medium">{contact.name}</span>
							<span class="text-muted-foreground">{contact.relationship}</span>
							<span class="flex flex-wrap gap-x-3">
								<bdi dir="ltr">{contact.phone}</bdi>
								{#if contact.phone2}
									<bdi dir="ltr">{contact.phone2}</bdi>
								{/if}
							</span>
						</div>
						<div class="flex">
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.profile_edit_item({ name: contact.name })}
								onclick={() => (editingContact = contact)}
							>
								<PencilSimpleIcon />
							</Button>
							<RemoveItemButton
								kind="contact"
								itemId={contact.id}
								label={m.profile_remove_item({ name: contact.name })}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		<ContactForm
			data={contactData}
			editing={editingContact}
			onDone={() => (editingContact = null)}
		/>
	</section>

	<section class="flex flex-col gap-3">
		<h3 class="font-semibold">{m.profile_social_accounts()}</h3>
		{#if socials.length === 0}
			<p class="text-sm text-muted-foreground">{m.profile_socials_empty()}</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each socials as social (social.id)}
					<li class="flex items-center justify-between gap-2 text-sm">
						<div class="flex min-w-0 flex-col">
							<span class="font-medium">{platformLabel(social.platform)}</span>
							<bdi dir="ltr" class="truncate text-muted-foreground">{social.handle}</bdi>
						</div>
						<div class="flex">
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.profile_edit_item({ name: platformLabel(social.platform) })}
								onclick={() => (editingSocial = social)}
							>
								<PencilSimpleIcon />
							</Button>
							<RemoveItemButton
								kind="social"
								itemId={social.id}
								label={m.profile_remove_item({ name: platformLabel(social.platform) })}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		<SocialForm data={socialData} editing={editingSocial} onDone={() => (editingSocial = null)} />
	</section>
</div>
