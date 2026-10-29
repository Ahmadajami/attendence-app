<script lang="ts">
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import CalendarPlusIcon from 'phosphor-svelte/lib/CalendarPlusIcon';
	import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon';
	import AssignSheet from '#lib/app/patterns/AssignSheet.svelte';
	import ScheduleSheet from '#lib/app/patterns/ScheduleSheet.svelte';
	import StaffingStrip from '#lib/app/patterns/StaffingStrip.svelte';
	import PatternHistory from '#lib/app/roster/PatternHistory.svelte';
	import PreviewRange from '#lib/app/roster/PreviewRange.svelte';
	import RosterPreview from '#lib/app/roster/RosterPreview.svelte';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
	import { formatCalendarDate, shiftsById, weekdayNames } from '#lib/app/roster/labels.js';
	import { previewDays, type PreviewRow } from '#lib/app/roster/preview.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { staffing } from '#lib/roster/assignments.js';
	import { patternOn } from '#lib/roster/roster.js';
	import type { MemberSchedule } from '#lib/server/services/roster/roster.bl.js';
	import { lookupName, personName, teamName } from '#lib/utils/locale.js';
	import SupervisorsCard from './SupervisorsCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const byId = $derived(shiftsById(data.preview.shifts));
	const patternById = $derived(new Map(data.patterns.map((p) => [p.id, p])));
	const patternNames = $derived(new Map(data.patterns.map((p) => [p.id, lookupName(p)])));
	const activePatterns = $derived(data.patterns.filter((p) => p.active));

	/** The team's assignment today, and the next scheduled one. */
	const current = $derived(patternOn(data.versions, data.today));
	const next = $derived(data.versions.find((v) => v.effectiveFrom > data.today));
	const currentPattern = $derived(current ? patternById.get(current.patternId) : undefined);

	/** Everyone in the team at some point in the preview window, once each. */
	const people = $derived(
		data.members.filter((row, i, all) => all.findIndex((r) => r.staffId === row.staffId) === i)
	);
	const rows = $derived<PreviewRow[]>(
		people.map((person) => ({
			id: person.staffId,
			label: personName(person),
			href: localizedHref('/employees/[id]', { id: person.staffId }),
			days: previewDays(data.preview, person.staffId)
		}))
	);
	/** People per shift per day, counting only days in this team (B15). */
	const strip = $derived(
		staffing(rows.flatMap((row) => row.days.filter((day) => day.teamId === data.team.id)))
	);

	const weekdays = $derived(weekdayNames());
	function rulesText(member: MemberSchedule): string {
		const parts: string[] = [];
		if (member.rules?.offWeekdays)
			parts.push(
				m.schedule_rules_off({
					days: member.rules.offWeekdays.map((d) => weekdays[d]).join(m.list_separator())
				})
			);
		if (member.rules?.crewStart !== null && member.rules?.crewStart !== undefined)
			parts.push(m.schedule_crew_start_option({ day: member.rules.crewStart + 1 }));
		return parts.length > 0 ? parts.join(m.list_separator()) : '—';
	}
	const followsLabel = (member: MemberSchedule) =>
		member.follows === 'personal'
			? m.schedule_follows_personal()
			: member.follows === 'team'
				? m.schedule_follows_team()
				: member.follows === 'department'
					? m.schedule_follows_department()
					: m.schedule_follows_none();

	let assignOpen = $state(false);
	let scheduleOpen = $state(false);
	let selected = $state<MemberSchedule | null>(null);

	function editRules(member: MemberSchedule) {
		selected = member;
		scheduleOpen = true;
	}
</script>

<svelte:head>
	<title>{teamName(data.team)} · {m.teams_title()} · {m.app_name()}</title>
</svelte:head>

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
			<Card.Title>{m.team_schedule_title()}</Card.Title>
			<Card.Description>{m.team_schedule_description()}</Card.Description>
			{#if data.canManage}
				<Card.Action>
					<Button variant="outline" size="sm" onclick={() => (assignOpen = true)}>
						<CalendarPlusIcon data-icon="inline-start" />
						{m.team_schedule_change()}
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="flex flex-col gap-2 text-sm">
				{#if current && currentPattern}
					<div class="flex flex-wrap items-center gap-2">
						<a
							href={localizedHref('/patterns/[id]', { id: currentPattern.id })}
							class="font-medium hover:underline"
						>
							{lookupName(currentPattern)}
						</a>
						<span class="text-muted-foreground">
							{m.team_schedule_since({ date: formatCalendarDate(current.effectiveFrom) })}
						</span>
					</div>
					<div class="flex flex-wrap gap-1">
						{#each currentPattern.slots as slot, index (index)}
							<ShiftChip shift={slot === null ? null : (byId.get(slot) ?? null)} />
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground">{m.team_schedule_none()}</p>
				{/if}
				{#if next}
					<p class="text-muted-foreground">
						{m.team_schedule_next({
							name: patternNames.get(next.patternId) ?? '—',
							date: formatCalendarDate(next.effectiveFrom)
						})}
					</p>
				{/if}
			</div>

			<div class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="font-medium">{m.roster_preview_title()}</h3>
					<PreviewRange from={data.preview.from} days={data.preview.days} today={data.today} />
				</div>
				<RosterPreview {rows} today={data.today} teamId={data.team.id} punches={data.punches} />
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.roster_members_title()}</Card.Title>
			<Card.Description>{m.team_members_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.employees_col_name()}</Table.Head>
						<Table.Head>{m.team_members_col_follows()}</Table.Head>
						<Table.Head>{m.team_members_col_rules()}</Table.Head>
						{#if data.canManage}
							<Table.Head><span class="sr-only">{m.team_members_col_actions()}</span></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.memberSchedules as member (member.staffId)}
						<Table.Row>
							<Table.Cell class="font-medium">
								<a
									href={localizedHref('/employees/[id]', { id: member.staffId })}
									class="hover:underline"
								>
									{personName(member)}
								</a>
								{#if member.joinsOn}
									<Badge variant="outline" class="ms-2">
										{m.roster_member_from({ date: formatCalendarDate(member.joinsOn) })}
									</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<Badge variant={member.follows === 'team' ? 'secondary' : 'outline'}>
									{followsLabel(member)}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">{rulesText(member)}</Table.Cell>
							{#if data.canManage}
								<Table.Cell class="text-end">
									<Button
										variant="ghost"
										size="sm"
										aria-label={m.team_members_edit_rules({ name: personName(member) })}
										onclick={() => editRules(member)}
									>
										<SlidersHorizontalIcon data-icon="inline-start" />
										{m.team_members_rules()}
									</Button>
								</Table.Cell>
							{/if}
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell
								colspan={data.canManage ? 4 : 3}
								class="h-16 text-center text-muted-foreground"
							>
								{m.roster_members_empty()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.staffing_title()}</Card.Title>
			<Card.Description>{m.staffing_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<StaffingStrip days={strip} shifts={data.preview.shifts} today={data.today} />
		</Card.Content>
	</Card.Root>

	<SupervisorsCard
		supervisors={data.supervisors}
		staffOptions={data.staffOptions}
		canManage={data.canManage}
	/>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.roster_history_title()}</Card.Title>
		</Card.Header>
		<Card.Content class="px-0">
			<PatternHistory
				versions={data.versions}
				today={data.today}
				shifts={data.preview.shifts}
				{patternNames}
			/>
		</Card.Content>
	</Card.Root>
</section>

{#if data.canManage}
	<AssignSheet
		data={data.assignForm}
		action="?/assign"
		targetKind="team"
		targetId={data.team.id}
		patterns={activePatterns}
		today={data.today}
		buildHref={`${localizedHref('/patterns/new')}?targetKind=team&targetId=${data.team.id}`}
		title={m.team_schedule_change()}
		description={m.team_assign_description({ name: teamName(data.team) })}
		bind:open={assignOpen}
	/>
	{#if selected}
		<ScheduleSheet
			setData={data.scheduleForm}
			resetData={data.resetForm}
			setAction="?/setSchedule"
			resetAction="?/resetSchedule"
			staffId={selected.staffId}
			name={personName(selected)}
			patternType={selected.patternType}
			cycleLength={selected.cycleLength}
			current={selected.rules}
			today={data.today}
			bind:open={scheduleOpen}
		/>
	{/if}
{/if}
