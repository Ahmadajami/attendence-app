<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import AddressBookIcon from 'phosphor-svelte/lib/AddressBookIcon';
	import BriefcaseIcon from 'phosphor-svelte/lib/BriefcaseIcon';
	import DeviceMobileIcon from 'phosphor-svelte/lib/DeviceMobileIcon';
	import FilesIcon from 'phosphor-svelte/lib/FilesIcon';
	import IdentificationCardIcon from 'phosphor-svelte/lib/IdentificationCardIcon';
	import ListBulletsIcon from 'phosphor-svelte/lib/ListBulletsIcon';
	import StarIcon from 'phosphor-svelte/lib/StarIcon';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as UnderlineTabs from '#lib/components/ui/underline-tabs/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { CUSTODY_STATUSES } from '#lib/schemas/staff-profile.schema.js';
	import type {
		contactFormSchema,
		custodyFormSchema,
		documentFormSchema,
		experienceFormSchema,
		profileNamesFormSchema,
		ProfileMessage,
		skillFormSchema,
		socialFormSchema
	} from '#lib/schemas/staff-profile.schema.js';
	import type { StaffProfile } from '#lib/types/profile.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { displayName } from '#lib/workforce/profile.js';
	import ContactsPanel from './ContactsPanel.svelte';
	import CustodyPanel from './CustodyPanel.svelte';
	import DocumentsPanel from './DocumentsPanel.svelte';
	import ExperiencePanel from './ExperiencePanel.svelte';
	import { custodyStatusLabel, experienceText } from './labels.js';
	import NamesForm from './NamesForm.svelte';
	import SkillsPanel from './SkillsPanel.svelte';

	type Form<T extends Record<string, unknown>> = SuperValidated<T, ProfileMessage>;

	type Props = {
		profile: StaffProfile;
		namesForm: Form<Infer<typeof profileNamesFormSchema>>;
		contactForm: Form<Infer<typeof contactFormSchema>>;
		socialForm: Form<Infer<typeof socialFormSchema>>;
		experienceForm: Form<Infer<typeof experienceFormSchema>>;
		skillForm: Form<Infer<typeof skillFormSchema>>;
		documentForm: Form<Infer<typeof documentFormSchema>>;
		custodyForm: Form<Infer<typeof custodyFormSchema>>;
		today: string;
	};

	let {
		profile,
		namesForm,
		contactForm,
		socialForm,
		experienceForm,
		skillForm,
		documentForm,
		custodyForm,
		today
	}: Props = $props();

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

	let tab = $state('overview');
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_title()}</Card.Title>
		<Card.Description>{m.profile_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<UnderlineTabs.Root bind:value={tab}>
			<UnderlineTabs.List>
				<UnderlineTabs.Trigger value="overview">
					<ListBulletsIcon />
					{m.profile_tab_overview()}
				</UnderlineTabs.Trigger>
				<UnderlineTabs.Trigger value="names">
					<IdentificationCardIcon />
					{m.profile_names_title()}
				</UnderlineTabs.Trigger>
				<UnderlineTabs.Trigger value="contacts">
					<AddressBookIcon />
					{m.profile_contacts_title()}
				</UnderlineTabs.Trigger>
				<UnderlineTabs.Trigger value="experience">
					<BriefcaseIcon />
					{m.profile_experience_title()}
				</UnderlineTabs.Trigger>
				<UnderlineTabs.Trigger value="skills">
					<StarIcon />
					{m.profile_skills_title()}
				</UnderlineTabs.Trigger>
				<UnderlineTabs.Trigger value="documents">
					<FilesIcon />
					{m.profile_documents_title()}
				</UnderlineTabs.Trigger>
				<UnderlineTabs.Trigger value="custody">
					<DeviceMobileIcon />
					{m.profile_custody_title()}
				</UnderlineTabs.Trigger>
			</UnderlineTabs.List>

			<UnderlineTabs.Content value="overview" class="pt-2">
				<dl class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
					<div class="flex flex-col gap-0.5">
						<dt class="text-muted-foreground">{m.profile_names()}</dt>
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
						<dt class="text-muted-foreground">{m.profile_field_job_title()}</dt>
						<dd>{profile.jobTitle ? lookupName(profile.jobTitle) : '—'}</dd>
					</div>
					<div class="flex flex-col gap-0.5">
						<dt class="text-muted-foreground">{m.profile_field_personal_email()}</dt>
						<dd>
							{#if person.personalEmail}
								<bdi dir="ltr">{person.personalEmail}</bdi>
							{:else}
								—
							{/if}
						</dd>
					</div>
					<div class="flex flex-col gap-0.5">
						<dt class="text-muted-foreground">{m.profile_experience_title()}</dt>
						<dd>{experienceText(profile.summary.experienceMonths)}</dd>
					</div>
					<div class="flex flex-col gap-0.5">
						<dt class="text-muted-foreground">{m.profile_contacts_title()}</dt>
						<dd>
							{m.profile_contacts_count({
								contacts: profile.contacts.length,
								socials: profile.socials.length
							})}
						</dd>
					</div>
					<div class="flex flex-col gap-0.5">
						<dt class="text-muted-foreground">{m.profile_skills_title()}</dt>
						<dd>
							{profile.skills.length > 0
								? profile.skills.map((s) => lookupName(s)).join(m.list_separator())
								: '—'}
						</dd>
					</div>
					<div class="flex flex-col gap-0.5">
						<dt class="text-muted-foreground">{m.profile_custody_title()}</dt>
						<dd>{custodyText || '—'}</dd>
					</div>
					<div class="flex flex-col gap-0.5 sm:col-span-2">
						<dt class="text-muted-foreground">{m.profile_documents_title()}</dt>
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
			</UnderlineTabs.Content>

			<UnderlineTabs.Content value="names" class="flex flex-col gap-4 pt-2">
				<p class="text-sm text-muted-foreground">{m.profile_names_description()}</p>
				<NamesForm data={namesForm} {person} jobTitles={profile.jobTitles} />
			</UnderlineTabs.Content>

			<UnderlineTabs.Content value="contacts" class="pt-2">
				<ContactsPanel
					contactData={contactForm}
					socialData={socialForm}
					contacts={profile.contacts}
					socials={profile.socials}
				/>
			</UnderlineTabs.Content>

			<UnderlineTabs.Content value="experience" class="pt-2">
				<ExperiencePanel
					data={experienceForm}
					experience={profile.experience}
					totalMonths={profile.summary.experienceMonths}
					startDate={person.startDate}
				/>
			</UnderlineTabs.Content>

			<UnderlineTabs.Content value="skills" class="pt-2">
				<SkillsPanel data={skillForm} skills={profile.skills} options={profile.skillOptions} />
			</UnderlineTabs.Content>

			<UnderlineTabs.Content value="documents" class="pt-2">
				<DocumentsPanel
					data={documentForm}
					documents={profile.documents}
					summary={documents}
					{today}
				/>
			</UnderlineTabs.Content>
			<UnderlineTabs.Content value="custody" class="pt-2">
				<CustodyPanel
					data={custodyForm}
					items={profile.custody}
					types={profile.custodyTypes}
					{today}
				/>
			</UnderlineTabs.Content>
		</UnderlineTabs.Root>
	</Card.Content>
</Card.Root>
