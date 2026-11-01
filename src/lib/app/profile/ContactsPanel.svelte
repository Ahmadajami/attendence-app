<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import AddressBookIcon from 'phosphor-svelte/lib/AddressBookIcon';
	import AtIcon from 'phosphor-svelte/lib/AtIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type {
		contactFormSchema,
		ProfileMessage,
		socialFormSchema
	} from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileContact, ProfileSocial } from '#lib/types/profile.js';
	import ContactForm from './ContactForm.svelte';
	import FormSheet from './FormSheet.svelte';
	import { platformLabel } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';
	import SocialForm from './SocialForm.svelte';

	type Props = {
		contactData: SuperValidated<Infer<typeof contactFormSchema>, ProfileMessage>;
		socialData: SuperValidated<Infer<typeof socialFormSchema>, ProfileMessage>;
		contacts: ProfileContact[];
		socials: ProfileSocial[];
		/** The person's name, for the sheets' descriptions. */
		name: string;
	};

	let { contactData, socialData, contacts, socials, name }: Props = $props();

	let contactOpen = $state(false);
	let editingContact = $state<ProfileContact | null>(null);
	let socialOpen = $state(false);
	let editingSocial = $state<ProfileSocial | null>(null);

	function openContact(contact: ProfileContact | null) {
		editingContact = contact;
		contactOpen = true;
	}

	function openSocial(social: ProfileSocial | null) {
		editingSocial = social;
		socialOpen = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_emergency_contacts()}</Card.Title>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => openContact(null)}>
				<PlusIcon data-icon="inline-start" />
				{m.profile_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if contacts.length === 0}
			<Empty icon={AddressBookIcon} title={m.profile_contacts_empty()} />
		{:else}
			<ul class="flex flex-col gap-3">
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
								onclick={() => openContact(contact)}
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
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_social_accounts()}</Card.Title>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => openSocial(null)}>
				<PlusIcon data-icon="inline-start" />
				{m.profile_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if socials.length === 0}
			<Empty icon={AtIcon} title={m.profile_socials_empty()} />
		{:else}
			<ul class="flex flex-col gap-3">
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
								onclick={() => openSocial(social)}
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
	</Card.Content>
</Card.Root>

<FormSheet
	title={editingContact ? m.profile_contact_edit() : m.profile_contact_add()}
	description={name}
	bind:open={contactOpen}
>
	<ContactForm data={contactData} editing={editingContact} onDone={() => (contactOpen = false)} />
</FormSheet>

<FormSheet
	title={editingSocial ? m.profile_social_edit() : m.profile_social_add()}
	description={name}
	bind:open={socialOpen}
>
	<SocialForm data={socialData} editing={editingSocial} onDone={() => (socialOpen = false)} />
</FormSheet>
