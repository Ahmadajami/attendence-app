<script lang="ts">
	import BuildingsIcon from 'phosphor-svelte/lib/BuildingsIcon';
	import CalendarXIcon from 'phosphor-svelte/lib/CalendarXIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';
	import UsersFourIcon from 'phosphor-svelte/lib/UsersFourIcon';
	import { formatCalendarDate, formatMonth } from '#lib/app/roster/labels.js';
	import RosterPreview from '#lib/app/roster/RosterPreview.svelte';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addMonths } from '#lib/roster/pattern-month.js';
	import type { PatternMonthData } from '#lib/server/services/assignments/assignments.bl.js';
	import { personName } from '#lib/utils/locale.js';

	type Props = {
		view: PatternMonthData;
		today: string;
		/** Cycle patterns show each follower's crew start. */
		isCycle: boolean;
	};

	let { view, today, isCycle }: Props = $props();

	const kindIcon = { staff: UserIcon, team: UsersFourIcon, department: BuildingsIcon } as const;
	const targetHref = (kind: 'staff' | 'team' | 'department', id: string) =>
		kind === 'staff'
			? localizedHref('/employees/[id]', { id })
			: kind === 'team'
				? localizedHref('/teams/[id]', { id })
				: localizedHref('/departments');
	const personHref = (id: string) => `${localizedHref('/employees/[id]', { id })}?tab=schedule`;
	const swapHref = (id: string) => `${localizedHref('/changes')}?swap=${id}`;

	const range = (from: string, to: string) =>
		m.schedule_history_range({ from: formatCalendarDate(from), to: formatCalendarDate(to) });
	const dayOf = (date: string) => Number(date.slice(8));

	const rows = $derived(
		view.followers.map((f) => ({
			id: f.staffId,
			label: personName(f),
			href: localizedHref('/employees/[id]', { id: f.staffId }),
			days: f.days
		}))
	);
	/** Shift codes worked in the month, for the count rows. */
	const codes = $derived(
		[...new Set(view.counts.flatMap((c) => Object.keys(c.shifts)))].sort((a, b) =>
			a.localeCompare(b)
		)
	);
	const anyAbsent = $derived(view.counts.some((c) => c.absent > 0));
	const edits = $derived(
		view.followers
			.flatMap((f) =>
				f.editedDates.map((date) => ({
					key: `${f.staffId}:${date}`,
					staffId: f.staffId,
					name: personName(f),
					date,
					code: f.days.find((d) => d.date === date)?.shift?.code ?? null
				}))
			)
			.sort((a, b) => a.date.localeCompare(b.date))
	);
	const crewText = (starts: number[]) =>
		starts.length === 0
			? '—'
			: starts.map((s) => m.schedule_crew_start_option({ day: s + 1 })).join(m.list_separator());
</script>

<!-- A GET form: the month is in the URL (`?tab=month&month=`), so it survives a reload. -->
<form method="GET" class="flex flex-wrap items-center gap-2" data-sveltekit-noscroll>
	<input type="hidden" name="tab" value="month" />
	<Button
		type="submit"
		name="month"
		value={addMonths(view.month, -1)}
		variant="outline"
		size="icon"
		aria-label={m.patterns_month_prev()}
	>
		<CaretLeftIcon class="rtl:rotate-180" />
	</Button>
	<span class="min-w-36 text-center font-medium"><bdi>{formatMonth(view.month)}</bdi></span>
	<Button
		type="submit"
		name="month"
		value={addMonths(view.month, 1)}
		variant="outline"
		size="icon"
		aria-label={m.patterns_month_next()}
	>
		<CaretRightIcon class="rtl:rotate-180" />
	</Button>
	{#if view.month !== today.slice(0, 7)}
		<Button type="submit" name="month" value={today.slice(0, 7)} variant="ghost" size="sm">
			{m.patterns_month_this()}
		</Button>
	{/if}
</form>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.patterns_month_assigned_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if view.targets.length === 0}
			<p class="text-sm text-muted-foreground">{m.patterns_month_assigned_none()}</p>
		{:else}
			<ul class="flex flex-col gap-1.5 text-sm">
				{#each view.targets as target (`${target.kind}:${target.id}:${target.effectiveFrom}`)}
					{const Icon = $derived(kindIcon[target.kind])}
					<li class="flex flex-wrap items-center gap-2">
						<Icon class="size-4 text-muted-foreground" />
						<a href={targetHref(target.kind, target.id)} class="font-medium hover:underline">
							{personName({ fullName: target.nameEn, fullNameAr: target.nameAr })}
						</a>
						<span class="text-muted-foreground"><bdi>{range(target.from, target.to)}</bdi></span>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

{#if view.followers.length === 0}
	<Card.Root>
		<Card.Content>
			<Empty icon={CalendarXIcon} title={m.patterns_month_empty()} />
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.patterns_month_followed_title({ count: view.followers.length })}</Card.Title>
			<Card.Description>{m.patterns_month_followed_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.patterns_month_col_person()}</Table.Head>
						<Table.Head>{m.patterns_month_col_days()}</Table.Head>
						<Table.Head>{m.patterns_month_col_dates()}</Table.Head>
						{#if isCycle}
							<Table.Head>{m.schedule_field_crew_start()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each view.followers as follower (follower.staffId)}
						<Table.Row>
							<Table.Cell class="font-medium">
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() resolves; only `?tab=` is added -->
								<a href={personHref(follower.staffId)} class="hover:underline">
									{personName(follower)}
								</a>
							</Table.Cell>
							<Table.Cell>{follower.plannedDays}</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								<bdi>{range(follower.firstDate, follower.lastDate)}</bdi>
							</Table.Cell>
							{#if isCycle}
								<Table.Cell>{crewText(follower.crewStarts)}</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.patterns_month_grid_title()}</Card.Title>
			<Card.Description>{m.patterns_month_grid_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<RosterPreview {rows} {today} />

			<div class="flex flex-col gap-2">
				<h3 class="text-sm font-medium">{m.patterns_month_counts_title()}</h3>
				<div class="overflow-x-auto">
					<table class="w-full border-separate border-spacing-0.5 text-xs">
						<thead>
							<tr>
								<th scope="col" class="sticky start-0 bg-card pe-2 text-start font-medium">
									<span class="sr-only">{m.patterns_month_counts_kind()}</span>
								</th>
								{#each view.dates as date (date)}
									<th scope="col" class="min-w-7 text-center font-normal text-muted-foreground">
										{dayOf(date)}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each codes as code (code)}
								<tr>
									<th scope="row" class="sticky start-0 bg-card pe-2 text-start font-medium">
										<bdi dir="ltr">{code}</bdi>
									</th>
									{#each view.counts as count (count.date)}
										<td class="text-center">{count.shifts[code] ?? 0}</td>
									{/each}
								</tr>
							{/each}
							<tr>
								<th scope="row" class="sticky start-0 bg-card pe-2 text-start font-medium">
									{m.patterns_month_counts_off()}
								</th>
								{#each view.counts as count (count.date)}
									<td class="text-center text-muted-foreground">{count.off}</td>
								{/each}
							</tr>
							{#if anyAbsent}
								<tr>
									<th scope="row" class="sticky start-0 bg-card pe-2 text-start font-medium">
										{m.patterns_month_counts_absent()}
									</th>
									{#each view.counts as count (count.date)}
										<td class="text-center text-muted-foreground">{count.absent}</td>
									{/each}
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.patterns_month_changes_title()}</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2 text-sm">
			{#if view.swaps.length === 0 && edits.length === 0}
				<p class="text-muted-foreground">{m.patterns_month_changes_none()}</p>
			{/if}
			{#if view.swaps.length > 0}
				<ul class="flex flex-col gap-1">
					{#each view.swaps as swap (swap.id)}
						{const a = $derived(personName(swap.a))}
						{const first = $derived(formatCalendarDate(swap.firstDate))}
						{const second = $derived(swap.secondDate ? formatCalendarDate(swap.secondDate) : null)}
						<li class="flex flex-wrap items-center gap-x-2">
							<bdi>
								{#if swap.kind === 'shift_change'}
									{m.patterns_month_swap_shift_change({ date: first, a })}
								{:else if swap.kind === 'self_swap'}
									{m.patterns_month_swap_self({ date: first, second: second ?? '—', a })}
								{:else if second}
									{m.patterns_month_swap_return({
										date: first,
										second,
										a,
										b: swap.b ? personName(swap.b) : '—'
									})}
								{:else}
									{m.patterns_month_swap({ date: first, a, b: swap.b ? personName(swap.b) : '—' })}
								{/if}
							</bdi>
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() resolves; only `?swap=` is added -->
							<a href={swapHref(swap.id)} class="text-muted-foreground hover:underline">
								{m.swap_open()}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			{#if edits.length > 0}
				<ul class="flex flex-col gap-1">
					{#each edits as edit (edit.key)}
						<li>
							<bdi>
								{edit.code
									? m.patterns_month_edit({
											date: formatCalendarDate(edit.date),
											name: edit.name,
											shift: edit.code
										})
									: m.patterns_month_edit_off({
											date: formatCalendarDate(edit.date),
											name: edit.name
										})}
							</bdi>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
