<script lang="ts">
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import PatternForm from '#lib/app/roster/PatternForm.svelte';
	import PatternHistory from '#lib/app/roster/PatternHistory.svelte';
	import PreviewRange from '#lib/app/roster/PreviewRange.svelte';
	import RosterPreview from '#lib/app/roster/RosterPreview.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { previewDays, type PreviewRow } from '#lib/app/roster/preview.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { damascusDate } from '#lib/roster/cycle.js';
	import type { RosterPattern } from '#lib/roster/roster.js';
	import { personName, teamName } from '#lib/utils/locale.js';
	import SupervisorsCard from './SupervisorsCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Everyone in the team at some point in the preview window, once each. */
	const people = $derived(
		data.members.filter((row, i, all) => all.findIndex((r) => r.staffId === row.staffId) === i)
	);

	function rows(version: RosterPattern | null): PreviewRow[] {
		const draft = version
			? ({
					owner: 'team',
					teamId: data.team.id,
					version: { ...version, teamId: data.team.id }
				} as const)
			: null;
		return people.map((person) => ({
			id: person.staffId,
			label: personName(person),
			href: localizedHref('/employees/[id]', { id: person.staffId }),
			days: previewDays(data.preview, person.staffId, data.shiftStarts, draft)
		}));
	}

	const copySources = $derived(
		data.cycleSources.map((s) => ({ id: s.id, label: teamName(s), cycle: s.cycle }))
	);
</script>

<svelte:head>
	<title>{teamName(data.team)} · {m.teams_title()} · {m.app_name()}</title>
</svelte:head>

{#snippet preview(version: RosterPattern | null)}
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h3 class="font-medium">{m.roster_preview_title()}</h3>
			<PreviewRange from={data.preview.from} days={data.preview.days} today={data.today} />
		</div>
		<RosterPreview rows={rows(version)} today={data.today} teamId={data.team.id} />
	</div>
{/snippet}

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-2">
		<Button href={localizedHref('/teams')} variant="ghost" size="sm" class="self-start">
			<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
			{m.roster_back_to_teams()}
		</Button>
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="text-2xl font-semibold tracking-tight">{teamName(data.team)}</h2>
			<Badge variant={data.team.active ? 'secondary' : 'outline'}>
				{data.team.active ? m.teams_status_active() : m.teams_status_inactive()}
			</Badge>
		</div>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.roster_pattern_title()}</Card.Title>
			<Card.Description>{m.roster_pattern_description()}</Card.Description>
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

	<div class="grid gap-4 lg:grid-cols-2">
		<SupervisorsCard
			supervisors={data.supervisors}
			staffOptions={data.staffOptions}
			canManage={data.canManage}
		/>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.roster_members_title()}</Card.Title>
				<Card.Description>{m.roster_members_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.members.length === 0}
					<p class="text-sm text-muted-foreground">{m.roster_members_empty()}</p>
				{:else}
					<ul class="flex flex-col gap-2">
						{#each data.members as member (`${member.staffId}:${member.validFrom.toISOString()}`)}
							{const from = damascusDate(member.validFrom)}
							<li class="flex flex-wrap items-center justify-between gap-2">
								<a
									href={localizedHref('/employees/[id]', { id: member.staffId })}
									class="font-medium hover:underline"
								>
									{personName(member)}
								</a>
								<span class="text-sm text-muted-foreground">
									{#if from > data.today}
										{m.roster_member_from({ date: formatCalendarDate(from) })}
									{:else if member.validTo}
										{m.roster_member_until({
											date: formatCalendarDate(damascusDate(member.validTo))
										})}
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.roster_history_title()}</Card.Title>
		</Card.Header>
		<Card.Content class="px-0">
			<PatternHistory versions={data.versions} today={data.today} />
		</Card.Content>
	</Card.Root>
</section>
