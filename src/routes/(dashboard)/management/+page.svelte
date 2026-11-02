<script lang="ts">
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
	import TreeStructureIcon from 'phosphor-svelte/lib/TreeStructureIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import ManagerSheet from '#lib/app/management/ManagerSheet.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Department = (typeof data.tree.departments)[number];
	type Team = Department['teams'][number];
	type Gap = (typeof data.tree.gaps)[number];

	/** Inactive departments have no active people or sub-departments (the BL refuses that). */
	const departments = $derived(data.tree.departments.filter((d) => d.active));
	const departmentById = $derived(new Map(data.tree.departments.map((d) => [d.id, d])));
	const allTeams = $derived([
		...data.tree.departments.flatMap((d) => d.teams),
		...data.tree.unplacedTeams
	]);
	const teamById = $derived(new Map(allTeams.map((t) => [t.id, t])));
	const unplacedTeams = $derived(data.tree.unplacedTeams.filter((t) => t.active));

	/** Departments and teams with a gap, for the badges in the tree. */
	const flagged = $derived(
		new Set(data.tree.gaps.map((gap) => ('teamId' in gap ? gap.teamId : gap.departmentId)))
	);

	let dateForm: HTMLFormElement | null = $state(null);

	let sheetOpen = $state(false);
	let target = $state<Department | null>(null);

	function changeManager(department: Department) {
		target = department;
		sheetOpen = true;
	}

	function departmentLabel(id: string): string {
		const department = departmentById.get(id);
		return department ? lookupName(department) : '—';
	}

	function teamLabel(id: string): string {
		const team = teamById.get(id);
		return team ? lookupName(team) : '—';
	}

	function gapText(gap: Gap): string {
		const person = gap.person ? personName(gap.person) : '—';
		switch (gap.kind) {
			case 'department_without_manager':
				return m.management_gap_department_without_manager({
					department: departmentLabel(gap.departmentId)
				});
			case 'team_without_supervisor':
				return m.management_gap_team_without_supervisor({ team: teamLabel(gap.teamId) });
			case 'inactive_manager':
				return m.management_gap_inactive_manager({
					person,
					department: departmentLabel(gap.departmentId)
				});
			case 'inactive_supervisor':
				return m.management_gap_inactive_supervisor({ person, team: teamLabel(gap.teamId) });
			case 'supervisor_outside_branch':
				return m.management_gap_supervisor_outside_branch({ person, team: teamLabel(gap.teamId) });
		}
	}

	function gapKey(gap: Gap): string {
		return [
			gap.kind,
			'departmentId' in gap ? gap.departmentId : '',
			'teamId' in gap ? gap.teamId : '',
			'staffId' in gap ? gap.staffId : ''
		].join(':');
	}
</script>

<svelte:head>
	<title>{m.management_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.management_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.management_description()}</p>
		</div>

		<!-- A GET filter: the date lives in `?on=`, so it survives a reload. -->
		<form
			method="GET"
			bind:this={dateForm}
			class="flex flex-wrap items-end gap-2"
			data-sveltekit-noscroll
			data-sveltekit-reset="false"
		>
			<div class="flex flex-col gap-1.5">
				<Label for="management-date">{m.management_date()}</Label>
				<Input
					id="management-date"
					type="date"
					name="on"
					value={data.date}
					class="w-44"
					onchange={() => dateForm?.requestSubmit()}
				/>
			</div>
			{#if data.date !== data.today}
				<Button href={localizedHref('/management')} variant="ghost">
					{m.roster_preview_today()}
				</Button>
			{/if}
		</form>
	</div>

	{#if departments.length === 0}
		<Card.Root>
			<Card.Content>
				<Empty
					icon={TreeStructureIcon}
					title={m.management_empty()}
					description={m.management_empty_description()}
				>
					<Button href={localizedHref('/departments')} variant="outline">
						{m.management_open_departments()}
					</Button>
				</Empty>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<WarningIcon class="size-4 text-warning" />
					{m.management_gaps_title()}
				</Card.Title>
				<Card.Description>{m.management_gaps_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.tree.gaps.length > 0}
					<ul class="flex flex-col gap-2">
						{#each data.tree.gaps as gap (gapKey(gap))}
							<li class="flex flex-wrap items-center justify-between gap-2 text-sm">
								<span>{gapText(gap)}</span>
								{#if 'teamId' in gap}
									<Button
										href={localizedHref('/teams/[id]', { id: gap.teamId })}
										variant="outline"
										size="sm"
									>
										{m.management_open_team()}
									</Button>
								{:else}
									{const department = $derived(departmentById.get(gap.departmentId))}
									{#if department?.active}
										<Button
											variant="outline"
											size="sm"
											onclick={() => department && changeManager(department)}
										>
											{m.management_set_manager()}
										</Button>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-muted-foreground">{m.management_gaps_none()}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.management_structure_title()}</Card.Title>
				<Card.Description>
					{m.management_structure_description({ date: formatCalendarDate(data.date) })}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#each departments as department, index (department.id)}
					{#if index > 0}
						<Separator />
					{/if}
					<div
						class="flex flex-col gap-2 py-1"
						style:padding-inline-start="{department.depth * 1.5}rem"
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex flex-col gap-0.5">
								<span class="flex flex-wrap items-center gap-2 font-medium">
									{lookupName(department)}
									{#if flagged.has(department.id)}
										<WarningIcon class="size-4 text-warning" aria-label={m.management_has_gap()} />
									{/if}
									<span
										class="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"
									>
										<UsersThreeIcon class="size-3.5" />
										{m.management_people_count({ count: department.peopleCount })}
									</span>
								</span>
								<span class="text-sm">
									{#if department.manager}
										<a
											href={localizedHref('/employees/[id]', { id: department.manager.staffId })}
											class="hover:underline"
										>
											{personName(department.manager)}
										</a>
										{#if !department.manager.active}
											<Badge variant="outline" class="ms-1">{m.staff_status_inactive()}</Badge>
										{/if}
										<span class="text-xs text-muted-foreground">
											· {m.management_manager_since({
												date: formatCalendarDate(department.manager.validFrom)
											})}
										</span>
									{:else if department.coveredBy}
										<span class="text-muted-foreground">
											{m.management_covered_by({
												name: personName(department.coveredBy),
												department: departmentLabel(department.coveredBy.departmentId)
											})}
										</span>
									{:else}
										<span class="text-warning">{m.departments_no_manager()}</span>
									{/if}
								</span>
								{#if department.manager && !department.manager.active && department.coveredBy}
									<span class="text-xs text-muted-foreground">
										{m.management_covered_by({
											name: personName(department.coveredBy),
											department: departmentLabel(department.coveredBy.departmentId)
										})}
									</span>
								{/if}
							</div>
							<Button variant="outline" size="sm" onclick={() => changeManager(department)}>
								<ArrowsClockwiseIcon data-icon="inline-start" />
								{m.management_change_manager()}
							</Button>
						</div>

						{#each department.teams.filter((t) => t.active) as team (team.id)}
							{@render teamRow(team)}
						{/each}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>

		{#if unplacedTeams.length > 0}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.management_unplaced_title()}</Card.Title>
					<Card.Description>{m.management_unplaced_description()}</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-2">
					{#each unplacedTeams as team (team.id)}
						{@render teamRow(team)}
					{/each}
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</section>

{#snippet teamRow(team: Team)}
	<div class="flex flex-wrap items-center justify-between gap-2 ps-6 text-sm">
		<div class="flex flex-col gap-0.5">
			<span class="flex flex-wrap items-center gap-2">
				<a href={localizedHref('/teams/[id]', { id: team.id })} class="font-medium hover:underline">
					{lookupName(team)}
				</a>
				{#if flagged.has(team.id)}
					<WarningIcon class="size-4 text-warning" aria-label={m.management_has_gap()} />
				{/if}
				<span class="text-xs text-muted-foreground">
					{m.management_members_count({ count: team.memberCount })}
				</span>
			</span>
			<span class="text-muted-foreground">
				{#if team.supervisors.length > 0}
					{m.management_supervisors()}:
					{#each team.supervisors as supervisor, index (supervisor.staffId)}
						{#if index > 0}
							<span aria-hidden="true">,</span>
						{/if}
						<a
							href={localizedHref('/employees/[id]', { id: supervisor.staffId })}
							class={['hover:underline', !supervisor.active && 'line-through']}
						>
							{personName(supervisor)}
						</a>
					{/each}
				{:else}
					<span class="text-warning">{m.management_no_supervisor()}</span>
				{/if}
			</span>
		</div>
	</div>
{/snippet}

<ManagerSheet
	data={data.managerForm}
	action="?/setManager"
	department={target}
	currentStaffId={target?.manager?.staffId ?? null}
	people={data.people}
	history={target ? (data.histories[target.id] ?? []) : []}
	today={data.today}
	bind:open={sheetOpen}
/>
