<script lang="ts">
	import { enhance } from '$app/forms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import UserCheckIcon from 'phosphor-svelte/lib/UserCheckIcon';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { StaffProfile } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import { initials } from '#lib/workforce/profile.js';
	import { experienceText } from './labels.js';

	type Props = {
		profile: StaffProfile;
		/** A personal pattern in force today or scheduled. */
		hasPersonalPattern: boolean;
		/** Open the "Edit details" sheet. */
		onEdit: () => void;
	};

	let { profile, hasPersonalPattern, onEdit }: Props = $props();

	const person = $derived(profile.person);
	const name = $derived(personName(person));
	/** The name in the other language, when there is one. */
	const otherName = $derived(getLocale() === 'ar' ? person.fullName : person.fullNameAr);
	const department = $derived(
		person.departmentNameEn && person.departmentNameAr
			? { nameEn: person.departmentNameEn, nameAr: person.departmentNameAr }
			: null
	);
	const team = $derived(
		person.teamId && person.teamNameEn && person.teamNameAr
			? { id: person.teamId, nameEn: person.teamNameEn, nameAr: person.teamNameAr }
			: null
	);
	const months = $derived(profile.summary.experienceMonths);
</script>

<!-- Who the person is, at a glance (redesign plan V1). -->
<Card.Root>
	<Card.Content class="flex flex-wrap items-start gap-4">
		<Avatar.Root class="size-16">
			<Avatar.Fallback class="text-lg font-medium">{initials(name)}</Avatar.Fallback>
			<Avatar.Badge class={['size-3.5', person.active ? 'bg-primary' : 'bg-muted-foreground']}>
				<span class="sr-only">
					{person.active ? m.profile_header_status_active() : m.staff_status_inactive()}
				</span>
			</Avatar.Badge>
		</Avatar.Root>

		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-2xl font-semibold tracking-tight">{name}</h2>
				{#if !person.active}
					<Badge variant="outline">{m.staff_status_inactive()}</Badge>
				{/if}
				{#if hasPersonalPattern}
					<Badge variant="secondary">{m.roster_personal_badge()}</Badge>
				{/if}
			</div>
			{#if otherName && otherName !== name}
				<bdi class="text-muted-foreground" dir={getLocale() === 'ar' ? 'ltr' : 'rtl'}>
					{otherName}
				</bdi>
			{/if}
			<p class="flex flex-wrap items-center gap-x-2 text-sm">
				<bdi class="font-mono text-muted-foreground" dir="ltr">{person.employeeNo}</bdi>
				{#if profile.jobTitle}
					<span aria-hidden="true" class="text-muted-foreground">·</span>
					<span>{lookupName(profile.jobTitle)}</span>
				{/if}
				{#if department || team}
					<span aria-hidden="true" class="text-muted-foreground">·</span>
					<span>
						{#if department}{lookupName(department)}{/if}
						{#if department && team}
							<span class="text-muted-foreground">{m.profile_header_separator()}</span>
						{/if}
						{#if team}
							<a
								href={localizedHref('/teams/[id]', { id: team.id })}
								class="font-medium hover:underline"
							>
								{lookupName(team)}
							</a>
						{/if}
					</span>
				{/if}
			</p>
			<p class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
				{#if person.phone}
					<bdi dir="ltr">{person.phone}</bdi>
				{/if}
				{#if person.workEmail}
					<bdi dir="ltr">{person.workEmail}</bdi>
				{/if}
				{#if person.startDate}
					<span>{m.profile_header_since()} <bdi>{formatDate(person.startDate)}</bdi></span>
				{/if}
				{#if months > 0}
					<span>{experienceText(months)}</span>
				{/if}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={onEdit}>
				<PencilSimpleIcon data-icon="inline-start" />
				{m.profile_header_edit()}
			</Button>
			<form method="POST" action="?/setActive" use:enhance={toastNotice}>
				<input type="hidden" name="active" value={String(!person.active)} />
				<Button type="submit" variant="outline" size="sm">
					{#if person.active}
						<ProhibitIcon data-icon="inline-start" />
						{m.staff_deactivate()}
					{:else}
						<UserCheckIcon data-icon="inline-start" />
						{m.staff_activate()}
					{/if}
				</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>
