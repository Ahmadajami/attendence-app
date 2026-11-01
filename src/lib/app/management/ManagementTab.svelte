<script lang="ts">
	import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheckIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PersonManagementTree } from '#lib/server/services/management/management.bl.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import { initials } from '#lib/workforce/profile.js';
	import ReportTree from './ReportTree.svelte';

	type Props = {
		tree: PersonManagementTree;
		staffId: string;
		/** The person's display name. */
		name: string;
		today: string;
	};

	let { tree, staffId, name, today }: Props = $props();

	type Step = PersonManagementTree['ladder'][number];
	type Gap = PersonManagementTree['gaps'][number];

	let dateForm: HTMLFormElement | null = $state(null);

	const dateText = $derived(formatCalendarDate(tree.date));

	function profileHref(id: string): string {
		const base = localizedHref('/employees/[id]', { id });
		return tree.date === today
			? `${base}?tab=management`
			: `${base}?tab=management&on=${tree.date}`;
	}

	function stepKey(step: Step): string {
		return step.level === 'hr' ? 'hr' : `${step.level}:${step.staffId}`;
	}

	function roleText(step: Step): string {
		if (step.level === 'supervisor')
			return m.management_tree_role_supervisor({
				units: step.team ? lookupName(step.team) : '—'
			});
		if (step.level === 'manager') {
			const units = step.department ? lookupName(step.department) : '—';
			return step.approves
				? m.management_tree_role_manager({ units })
				: m.management_tree_role_manager_above({ units });
		}
		return m.management_tree_hr_hint();
	}

	function gapText(gap: Gap): string {
		const person = gap.person ? personName(gap.person) : '—';
		const team = gap.team ? lookupName(gap.team) : '—';
		const department = gap.department ? lookupName(gap.department) : '—';
		switch (gap.kind) {
			case 'department_without_manager':
				return m.management_gap_department_without_manager({ department });
			case 'team_without_supervisor':
				return m.management_gap_team_without_supervisor({ team });
			case 'inactive_manager':
				return m.management_gap_inactive_manager({ person, department });
			case 'inactive_supervisor':
				return m.management_gap_inactive_supervisor({ person, team });
			case 'supervisor_outside_branch':
				return m.management_gap_supervisor_outside_branch({ person, team });
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

<!-- The person's management tree (tree plan M15–M19): read-only; changes happen on /management
     (managers) and the team pages (supervisors). -->
<div class="flex flex-col gap-4">
	<!-- A GET filter: the date lives in `?on=` beside `?tab=management`. -->
	<form
		method="GET"
		bind:this={dateForm}
		class="flex flex-wrap items-end gap-2"
		data-sveltekit-noscroll
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
	>
		<input type="hidden" name="tab" value="management" />
		<div class="flex flex-col gap-1.5">
			<Label for="management-tree-date">{m.management_date()}</Label>
			<Input
				id="management-tree-date"
				type="date"
				name="on"
				value={tree.date}
				class="w-44"
				onchange={() => dateForm?.requestSubmit()}
			/>
		</div>
		{#if tree.date !== today}
			<Button
				href={`${localizedHref('/employees/[id]', { id: staffId })}?tab=management`}
				variant="ghost"
			>
				{m.roster_preview_today()}
			</Button>
		{/if}
	</form>

	{#if tree.gaps.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<WarningIcon class="size-4 text-warning" />
					{m.management_tree_gaps_title()}
				</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-col gap-2">
					{#each tree.gaps as gap (gapKey(gap))}
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
								<Button href={localizedHref('/management')} variant="outline" size="sm">
									{m.management_set_manager()}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.management_tree_reports_to_title()}</Card.Title>
			<Card.Description>
				{m.management_tree_reports_to_description({ name, date: dateText })}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<ol class="flex flex-col gap-3">
				{#each tree.ladder as step (stepKey(step))}
					<li class="flex items-center gap-3 text-sm">
						{#if step.level === 'hr'}
							<span
								class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
							>
								<ShieldCheckIcon class="size-4" />
							</span>
							<div class="flex flex-col">
								<span class="font-medium">{m.management_tree_hr()}</span>
								<span class="text-xs text-muted-foreground">{roleText(step)}</span>
							</div>
						{:else}
							<Avatar.Root class="size-8">
								<Avatar.Fallback class="text-xs font-medium">
									{step.person ? initials(personName(step.person)) : '?'}
								</Avatar.Fallback>
							</Avatar.Root>
							<div class="flex flex-col">
								<span class="flex flex-wrap items-center gap-2">
									{#if step.person}
										<a href={profileHref(step.staffId)} class="font-medium hover:underline">
											{personName(step.person)}
										</a>
									{/if}
									{#if !step.approves}
										<Badge variant="outline">{m.management_tree_above()}</Badge>
									{/if}
								</span>
								<span class="text-xs text-muted-foreground">{roleText(step)}</span>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		</Card.Content>
	</Card.Root>

	{#if tree.reports.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.management_tree_manages_title()}</Card.Title>
				<Card.Description>
					{m.management_tree_manages_description({
						count: tree.reportCount,
						name,
						date: dateText
					})}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ReportTree nodes={tree.reports} date={tree.date} {today} />
			</Card.Content>
		</Card.Root>
	{/if}
</div>
