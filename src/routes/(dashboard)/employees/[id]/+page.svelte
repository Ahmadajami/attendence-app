<script lang="ts">
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import PatternForm from '#lib/app/roster/PatternForm.svelte';
	import PatternHistory from '#lib/app/roster/PatternHistory.svelte';
	import PreviewRange from '#lib/app/roster/PreviewRange.svelte';
	import RosterPreview from '#lib/app/roster/RosterPreview.svelte';
	import { previewDays, type PreviewRow } from '#lib/app/roster/preview.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterPattern } from '#lib/roster/roster.js';
	import { personName, teamName } from '#lib/utils/locale.js';
	import EndPatternForm from './EndPatternForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const person = $derived(data.person);
	const team = $derived(
		person.teamId && person.teamNameEn && person.teamNameAr
			? { id: person.teamId, nameEn: person.teamNameEn, nameAr: person.teamNameAr }
			: null
	);

	function rows(version: RosterPattern | null): PreviewRow[] {
		const draft = version
			? ({ owner: 'personal', staffId: person.staffId, version } as const)
			: null;
		return [
			{
				id: person.staffId,
				label: personName(person),
				days: previewDays(data.preview, person.staffId, data.shiftStarts, draft)
			}
		];
	}

	const copySources = $derived(
		data.cycleSources.map((s) => ({ id: s.id, label: teamName(s), cycle: s.cycle }))
	);
</script>

<svelte:head>
	<title>{personName(person)} · {m.nav_employees()} · {m.app_name()}</title>
</svelte:head>

{#snippet preview(version: RosterPattern | null)}
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h3 class="font-medium">{m.roster_preview_title()}</h3>
			<PreviewRange from={data.preview.from} days={data.preview.days} today={data.today} />
		</div>
		<RosterPreview rows={rows(version)} today={data.today} />
	</div>
{/snippet}

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-2">
		<Button href={localizedHref('/employees')} variant="ghost" size="sm" class="self-start">
			<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
			{m.roster_back_to_employees()}
		</Button>
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="text-2xl font-semibold tracking-tight">{personName(person)}</h2>
			<bdi class="font-mono text-muted-foreground" dir="ltr">{person.employeeNo}</bdi>
			{#if !person.active}
				<Badge variant="outline">{m.staff_status_inactive()}</Badge>
			{/if}
			{#if data.hasPersonalPattern}
				<Badge variant="secondary">{m.roster_personal_badge()}</Badge>
			{/if}
		</div>
		<p class="text-muted-foreground">
			{#if team}
				{m.roster_person_team()}
				<a href={localizedHref('/teams/[id]', { id: team.id })} class="font-medium hover:underline">
					{teamName(team)}
				</a>
			{:else}
				{m.employees_no_team()}
			{/if}
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.roster_personal_title()}</Card.Title>
			<Card.Description>{m.roster_personal_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.canManage}
				<PatternForm
					data={data.patternForm}
					action="?/savePattern"
					shiftStarts={data.shiftStarts}
					today={data.today}
					{copySources}
					{preview}
				/>
			{:else}
				{@render preview(null)}
			{/if}
		</Card.Content>
	</Card.Root>

	{#if data.canManage && data.hasPersonalPattern}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.roster_end_title()}</Card.Title>
				<Card.Description>{m.roster_end_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<EndPatternForm data={data.endForm} today={data.today} />
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.roster_history_title()}</Card.Title>
		</Card.Header>
		<Card.Content class="px-0">
			<PatternHistory versions={data.versions} today={data.today} />
		</Card.Content>
	</Card.Root>
</section>
