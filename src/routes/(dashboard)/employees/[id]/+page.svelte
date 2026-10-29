<script lang="ts">
	import { untrack } from 'svelte';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import DayPanel from '#lib/app/attendance/DayPanel.svelte';
	import PatternForm from '#lib/app/roster/PatternForm.svelte';
	import PatternHistory from '#lib/app/roster/PatternHistory.svelte';
	import PreviewRange from '#lib/app/roster/PreviewRange.svelte';
	import RosterPreview from '#lib/app/roster/RosterPreview.svelte';
	import { previewDays, type PreviewRow } from '#lib/app/roster/preview.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { punchDays } from '#lib/attendance/entry.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterAssignment } from '#lib/roster/roster.js';
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

	const staffId = $derived(data.person.staffId);
	/**
	 * The day open in the day panel (from `?day=`, or a click on the preview). Starts again from
	 * `?day=` when another person opens in this reused page, not when the preview is paged.
	 */
	let selectedDay = $derived.by<string | null>(() => {
		void staffId;
		return untrack(() => data.selectedDay);
	});
	const punches = $derived(punchDays(data.events));
	const panelDay = $derived(
		selectedDay
			? previewDays(data.preview, person.staffId, null).find((d) => d.date === selectedDay)
			: undefined
	);

	function rows(version: RosterAssignment | null): PreviewRow[] {
		const draft = version
			? ({ owner: 'personal', staffId: person.staffId, version } as const)
			: null;
		return [
			{
				id: person.staffId,
				label: personName(person),
				days: previewDays(data.preview, person.staffId, draft)
			}
		];
	}

	const copySources = $derived(
		data.cycleSources.map((s) => ({
			id: s.id,
			label: teamName(s),
			type: s.type,
			slots: s.slots
		}))
	);
</script>

<svelte:head>
	<title>{personName(person)} · {m.nav_employees()} · {m.app_name()}</title>
</svelte:head>

{#snippet preview(version: RosterAssignment | null)}
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h3 class="font-medium">{m.roster_preview_title()}</h3>
			<PreviewRange from={data.preview.from} days={data.preview.days} today={data.today} />
		</div>
		<RosterPreview
			rows={rows(version)}
			today={data.today}
			{punches}
			{selectedDay}
			onSelectDay={(date) => (selectedDay = selectedDay === date ? null : date)}
		/>
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
				<!-- The page is reused from one person to the next: remount so the form holds this
				     person's pattern. Paging the preview keeps the key, so unsaved edits stay. -->
				{#key person.staffId}
					<PatternForm
						data={data.patternForm}
						action="?/savePattern"
						shifts={data.preview.shifts}
						today={data.today}
						{copySources}
						{preview}
					/>
				{/key}
			{:else}
				{@render preview(null)}
			{/if}
		</Card.Content>
	</Card.Root>

	{#if panelDay}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.attendance_day_title()}</Card.Title>
				<Card.Description>{m.attendance_day_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<!-- Keyed by person too: the add-pair form keeps the staff id it was opened with. -->
				{#key `${person.staffId}:${panelDay.date}`}
					<DayPanel
						staffId={person.staffId}
						day={panelDay}
						events={data.events.filter((e) => e.shiftDate === panelDay.date)}
						shifts={data.preview.shifts}
						canRecord={data.canRecord}
					/>
				{/key}
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.canManage && data.hasPersonalPattern}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.roster_end_title()}</Card.Title>
				<Card.Description>{m.roster_end_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#key person.staffId}
					<EndPatternForm data={data.endForm} today={data.today} />
				{/key}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.roster_history_title()}</Card.Title>
		</Card.Header>
		<Card.Content class="px-0">
			<PatternHistory versions={data.versions} today={data.today} shifts={data.preview.shifts} />
		</Card.Content>
	</Card.Root>
</section>
