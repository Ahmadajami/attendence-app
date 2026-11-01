<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { CUSTODY_STATUSES } from '#lib/schemas/staff-profile.schema.js';
	import type { StaffProfile } from '#lib/types/profile.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { displayName } from '#lib/workforce/profile.js';
	import { custodyStatusLabel, experienceText, type ProfileTab } from './labels.js';

	type Props = {
		profile: StaffProfile;
		/** Open another tab (the label of each line links to where it is edited, V10). */
		onOpen: (tab: ProfileTab) => void;
	};

	let { profile, onOpen }: Props = $props();

	const person = $derived(profile.person);
	const nameEn = $derived(displayName(person.firstNameEn, person.lastNameEn));
	const nameAr = $derived(displayName(person.firstNameAr, person.lastNameAr));
	const documents = $derived(profile.summary.documents);
	const missingDocuments = $derived(
		profile.documents
			.filter((d) => documents.missing.includes(d.type.id))
			.map((d) => lookupName(d.type))
			.join(m.list_separator())
	);

	/** "2 with the employee, 1 lost", statuses in their usual order. */
	const custodyText = $derived(
		CUSTODY_STATUSES.filter((status) => profile.summary.custody[status])
			.map((status) =>
				m.profile_custody_count({
					count: profile.summary.custody[status] ?? 0,
					status: custodyStatusLabel(status)
				})
			)
			.join(m.list_separator())
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_title()}</Card.Title>
		<Card.Description>{m.profile_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<dl class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
			<div class="flex flex-col gap-0.5">
				{@render label(m.profile_names(), 'personal')}
				<dd>
					{#if nameEn || nameAr}
						{#if nameEn}<bdi dir="ltr">{nameEn}</bdi>{/if}
						{#if nameEn && nameAr}<span class="text-muted-foreground"> · </span>{/if}
						{#if nameAr}<bdi dir="rtl">{nameAr}</bdi>{/if}
					{:else}
						<span class="text-muted-foreground">{m.profile_names_not_set()}</span>
					{/if}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				{@render label(m.profile_field_job_title(), 'personal')}
				<dd>{profile.jobTitle ? lookupName(profile.jobTitle) : '—'}</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				{@render label(m.profile_field_personal_email(), 'personal')}
				<dd>
					{#if person.personalEmail}<bdi dir="ltr">{person.personalEmail}</bdi>{:else}—{/if}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				{@render label(m.profile_experience_title(), 'experience')}
				<dd>{experienceText(profile.summary.experienceMonths)}</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				{@render label(m.profile_contacts_title(), 'personal')}
				<dd>
					{m.profile_contacts_count({
						contacts: profile.contacts.length,
						socials: profile.socials.length
					})}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				{@render label(m.profile_skills_title(), 'skills')}
				<dd>
					{profile.skills.length > 0
						? profile.skills.map((s) => lookupName(s)).join(m.list_separator())
						: '—'}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				{@render label(m.profile_custody_title(), 'custody')}
				<dd>{custodyText || '—'}</dd>
			</div>
			<div class="flex flex-col gap-0.5 sm:col-span-2">
				{@render label(m.profile_documents_title(), 'documents')}
				<dd>
					{m.profile_documents_received_of({
						received: documents.received,
						required: documents.required
					})}
					{#if missingDocuments}
						<span class="text-destructive">
							· {m.profile_documents_missing({ names: missingDocuments })}
						</span>
					{/if}
				</dd>
			</div>
		</dl>
	</Card.Content>
</Card.Root>

{#snippet label(text: string, tab: ProfileTab)}
	<dt>
		<Button
			variant="link"
			size="sm"
			class="h-auto p-0 text-muted-foreground"
			onclick={() => onOpen(tab)}
		>
			{text}
		</Button>
	</dt>
{/snippet}
