<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { getStaffLists } from '#lib/app/staff-lists/context.js';
	import { manageLabel } from '#lib/app/staff-lists/labels.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type {
		contactFormSchema,
		profileIdentityFormSchema,
		profileNamesFormSchema,
		ProfileMessage,
		socialFormSchema
	} from '#lib/schemas/staff-profile.schema.js';
	import type { StaffListOption, StaffProfile } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { displayName } from '#lib/workforce/profile.js';
	import ContactsPanel from './ContactsPanel.svelte';
	import FormSheet from './FormSheet.svelte';
	import IdentityForm from './IdentityForm.svelte';
	import NamesForm from './NamesForm.svelte';

	type Form<T extends Record<string, unknown>> = SuperValidated<T, ProfileMessage>;

	type Props = {
		profile: StaffProfile;
		namesForm: Form<Infer<typeof profileNamesFormSchema>>;
		identityForm: Form<Infer<typeof profileIdentityFormSchema>>;
		contactForm: Form<Infer<typeof contactFormSchema>>;
		socialForm: Form<Infer<typeof socialFormSchema>>;
		/** The whole job title list, active and inactive. */
		jobTitles: StaffListOption[];
		/** The person's name, for the sheets' descriptions. */
		name: string;
	};

	let { profile, namesForm, identityForm, contactForm, socialForm, jobTitles, name }: Props =
		$props();

	const lists = getStaffLists();
	const person = $derived(profile.person);
	const nameEn = $derived(displayName(person.firstNameEn, person.lastNameEn));
	const nameAr = $derived(displayName(person.firstNameAr, person.lastNameAr));
	let namesOpen = $state(false);
	let identityOpen = $state(false);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_names_title()}</Card.Title>
		<Card.Description>{m.profile_names_description()}</Card.Description>
		<Card.Action class="flex flex-wrap justify-end gap-2">
			<Button variant="ghost" size="sm" onclick={() => lists.manage('job_title')}>
				<ListChecksIcon data-icon="inline-start" />
				{manageLabel('job_title')}
			</Button>
			<Button variant="outline" size="sm" onclick={() => (namesOpen = true)}>
				<PencilSimpleIcon data-icon="inline-start" />
				{m.profile_edit()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<dl class="grid gap-4 text-sm sm:grid-cols-2">
			<div class="flex flex-col gap-0.5">
				<dt class="text-muted-foreground">{m.profile_name_en()}</dt>
				<dd>
					{#if nameEn}<bdi dir="ltr">{nameEn}</bdi>{:else}{m.profile_names_not_set()}{/if}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				<dt class="text-muted-foreground">{m.profile_name_ar()}</dt>
				<dd>
					{#if nameAr}<bdi dir="rtl">{nameAr}</bdi>{:else}{m.profile_names_not_set()}{/if}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				<dt class="text-muted-foreground">{m.profile_field_job_title()}</dt>
				<dd>{profile.jobTitle ? lookupName(profile.jobTitle) : m.profile_no_job_title()}</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				<dt class="text-muted-foreground">{m.profile_field_personal_email()}</dt>
				<dd>
					{#if person.personalEmail}<bdi dir="ltr">{person.personalEmail}</bdi>{:else}—{/if}
				</dd>
			</div>
		</dl>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_identity_title()}</Card.Title>
		<Card.Description>{m.profile_identity_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => (identityOpen = true)}>
				<PencilSimpleIcon data-icon="inline-start" />
				{m.profile_edit()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<dl class="grid gap-4 text-sm sm:grid-cols-2">
			{@render item(m.profile_field_father_name_en(), person.fatherNameEn, 'ltr')}
			{@render item(m.profile_field_father_name_ar(), person.fatherNameAr, 'rtl')}
			{@render item(m.profile_field_mother_name_en(), person.motherNameEn, 'ltr')}
			{@render item(m.profile_field_mother_name_ar(), person.motherNameAr, 'rtl')}
			{@render item(m.profile_field_national_id_no(), person.nationalIdNo, 'ltr')}
			{@render item(m.profile_field_passport_no(), person.passportNo, 'ltr')}
			{@render item(
				m.profile_field_national_id_issued_on(),
				person.nationalIdIssuedOn && formatDate(person.nationalIdIssuedOn)
			)}
			{@render item(
				m.profile_field_national_id_expires_on(),
				person.nationalIdExpiresOn && formatDate(person.nationalIdExpiresOn)
			)}
		</dl>
	</Card.Content>
</Card.Root>

<ContactsPanel
	contactData={contactForm}
	socialData={socialForm}
	contacts={profile.contacts}
	socials={profile.socials}
	{name}
/>

<FormSheet title={m.profile_names_title()} description={name} bind:open={namesOpen}>
	<p class="pb-4 text-sm text-muted-foreground">{m.profile_names_description()}</p>
	<NamesForm data={namesForm} {jobTitles} onDone={() => (namesOpen = false)} />
</FormSheet>

<FormSheet title={m.profile_identity_title()} description={name} bind:open={identityOpen}>
	<IdentityForm data={identityForm} onDone={() => (identityOpen = false)} />
</FormSheet>

{#snippet item(label: string, value: string | null, dir?: 'ltr' | 'rtl')}
	<div class="flex flex-col gap-0.5">
		<dt class="text-muted-foreground">{label}</dt>
		<dd>
			{#if value}<bdi {dir}>{value}</bdi>{:else}—{/if}
		</dd>
	</div>
{/snippet}
