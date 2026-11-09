<script lang="ts">
	import ClockCounterClockwiseIcon from 'phosphor-svelte/lib/ClockCounterClockwiseIcon';
	import { formatCalendarDate, weekdayNames } from '#lib/app/roster/labels.js';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addDays } from '#lib/roster/cycle.js';
	import { inPeriod, type SchedulePeriod } from '#lib/roster/schedule-history.js';
	import type { ScheduleHistoryData } from '#lib/server/services/roster/roster.bl.js';
	import { lookupName, personName, teamName } from '#lib/utils/locale.js';

	type Props = {
		history: ScheduleHistoryData;
		/** Library pattern names by id. */
		patternNames: ReadonlyMap<string, string>;
		today: string;
	};

	let { history, patternNames, today }: Props = $props();

	const teams = $derived(new Map(history.teams.map((t) => [t.id, t])));
	const departments = $derived(new Map(history.departments.map((d) => [d.id, d])));
	const weekdays = $derived(weekdayNames());

	function dates(period: SchedulePeriod): string {
		const from = formatCalendarDate(period.from);
		return period.to === null
			? m.schedule_history_from_open({ from })
			: m.schedule_history_range({ from, to: formatCalendarDate(addDays(period.to, -1)) });
	}

	function plannedBy(period: SchedulePeriod): string {
		const team = period.teamId ? teams.get(period.teamId) : undefined;
		const department = period.departmentId ? departments.get(period.departmentId) : undefined;
		if (period.source === 'personal') return m.schedule_history_source_personal();
		if (period.source === 'department' && department)
			return m.schedule_history_source_department({ department: lookupName(department) });
		if (team) return m.schedule_history_source_team({ team: teamName(team) });
		return m.schedule_history_source_none();
	}

	function rules(period: SchedulePeriod): string | null {
		if (period.crewStart !== null)
			return m.schedule_crew_start_option({ day: period.crewStart + 1 });
		if (period.offWeekdays)
			return m.schedule_rules_off({
				days: period.offWeekdays.map((d) => weekdays[d]).join(m.list_separator())
			});
		return null;
	}

	const LINK = 'underline-offset-4 hover:underline';
	const personHref = (id: string) => `${localizedHref('/employees/[id]', { id })}?tab=schedule`;
	const swapHref = (id: string) => `${localizedHref('/changes')}?swap=${id}`;

	function state(period: SchedulePeriod): 'current' | 'scheduled' | 'past' {
		if (period.from > today) return 'scheduled';
		return inPeriod(period, today) ? 'current' : 'past';
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.schedule_history_title()}</Card.Title>
		<Card.Description>{m.schedule_history_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if history.periods.length === 0}
			<Empty icon={ClockCounterClockwiseIcon} title={m.schedule_history_empty()} />
		{:else}
			<ol class="flex flex-col gap-3">
				{#each history.periods as period, i (period.from)}
					{const status = $derived(state(period))}
					{const rule = $derived(rules(period))}
					{const swaps = $derived(history.swaps.filter((s) => inPeriod(period, s.firstDate)))}
					<li class={['flex flex-col gap-1 text-sm', status === 'past' && 'text-muted-foreground']}>
						{#if i > 0}
							<Separator class="mb-2" />
						{/if}
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="font-medium"><bdi>{dates(period)}</bdi></span>
							{#if status === 'current'}
								<Badge variant="secondary">{m.roster_history_current()}</Badge>
							{:else if status === 'scheduled'}
								<Badge variant="outline">{m.roster_history_scheduled()}</Badge>
							{/if}
						</div>
						<p>
							{plannedBy(period)}
							{#if period.patternId}
								·
								<a
									class="font-medium underline-offset-4 hover:underline"
									href={localizedHref('/patterns/[id]', { id: period.patternId })}
									><bdi>{patternNames.get(period.patternId) ?? '—'}</bdi></a
								>
							{:else if period.source === 'none' && period.teamId}
								· {m.schedule_history_no_pattern()}
							{/if}
							{#if period.anchorDate}
								· {m.roster_history_anchor({ date: formatCalendarDate(period.anchorDate) })}
							{/if}
						</p>
						{#if rule}
							<p>
								{rule}
								{#if period.ruleReason}
									<span class="text-muted-foreground">
										· {m.schedule_history_rule_reason({ reason: period.ruleReason })}
									</span>
								{/if}
							</p>
						{/if}
						{#if swaps.length > 0}
							<div class="flex flex-col gap-1">
								<p class="text-muted-foreground">
									{m.schedule_history_swaps({ count: swaps.length })}
								</p>
								<ul class="flex flex-col gap-1 ps-4">
									{#each swaps as swap (swap.id)}
										{const first = $derived(formatCalendarDate(swap.firstDate))}
										{const second = $derived(
											swap.secondDate ? formatCalendarDate(swap.secondDate) : null
										)}
										<li class="flex flex-wrap items-center gap-x-2">
											<bdi>
												{#if swap.kind === 'self_swap'}
													{m.schedule_history_swap_self({ date: first, other: second ?? '—' })}
												{:else if second}
													{m.schedule_history_swap_emp_return({ date: first, other: second })}
												{:else}
													{m.schedule_history_swap_emp({ date: first })}
												{/if}
											</bdi>
											{#if swap.other}
												<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() resolves; only `?tab=` / `?swap=` are added -->
												<a href={personHref(swap.other.staffId)} class={LINK}
													>{personName(swap.other)}</a
												>
											{/if}
											<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() resolves; only `?tab=` / `?swap=` are added -->
											<a href={swapHref(swap.id)} class={[LINK, 'text-muted-foreground']}>
												{m.swap_open()}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</Card.Content>
</Card.Root>
