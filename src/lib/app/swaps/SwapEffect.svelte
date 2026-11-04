<script lang="ts">
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import { formatCalendarDate, formatPreviewDay } from '#lib/app/roster/labels.js';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import { swapIssueText } from '#lib/roster/swap-labels.js';
	import type { SwapScope } from '#lib/schemas/enums.js';
	import type { SwapPreview } from '#lib/server/services/swaps/swaps.bl.js';
	import { lookupName, personName } from '#lib/utils/locale.js';

	// What a swap does to each person's day (swaps plan SW2): the day now (or, once applied, what the
	// pattern plans) and after the swap; then why it can't apply and the pending requests it may
	// clash with (SW7).

	type Props = {
		effect: SwapPreview;
		shifts: ReadonlyMap<string, Pick<RosterShift, 'code' | 'colour'>>;
		scope: SwapScope;
		/** The moves are the saved one-off shifts: "before" is the planned day. */
		applied?: boolean;
	};

	let { effect, shifts, scope, applied = false }: Props = $props();

	const nameOf = $derived(new Map(effect.people.map((p) => [p.staffId, personName(p)])));
	const moveOf = $derived(new Map(effect.moves.map((mv) => [`${mv.staffId}:${mv.date}`, mv])));
	const shiftOf = (id: string | null) => (id ? (shifts.get(id) ?? null) : null);

	type Line = {
		staffId: string;
		date: string;
		before: string | null;
		after: string | null | undefined;
	};
	const lines = $derived<Line[]>(
		applied
			? effect.moves.map((mv) => ({ ...mv }))
			: effect.days.map((d) => ({
					staffId: d.staffId,
					date: d.date,
					before: d.shiftId,
					after: moveOf.get(`${d.staffId}:${d.date}`)?.after
				}))
	);
</script>

<div class="flex flex-col gap-3">
	<ul class="flex flex-col gap-1 text-sm">
		{#each effect.people as person, i (person.staffId)}
			<li class="flex flex-wrap items-baseline gap-x-2">
				<span class="font-mono text-xs text-muted-foreground" dir="ltr">{i === 0 ? 'A' : 'B'}</span>
				<span class="font-medium">{personName(person)}</span>
				<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">{person.employeeNo}</bdi>
				<span class="text-muted-foreground">
					· {person.team ? lookupName(person.team) : m.swap_preview_team_none()}
				</span>
			</li>
		{/each}
	</ul>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>{m.swap_col_person()}</Table.Head>
				<Table.Head>{m.swap_col_date()}</Table.Head>
				<Table.Head>{applied ? m.swap_col_planned() : m.swap_col_now()}</Table.Head>
				<Table.Head>{m.swap_col_after()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each lines as line (`${line.staffId}:${line.date}`)}
				<Table.Row>
					<Table.Cell>{nameOf.get(line.staffId) ?? ''}</Table.Cell>
					<Table.Cell class="whitespace-nowrap">
						<bdi>{formatCalendarDate(line.date)}</bdi>
						<span class="text-xs text-muted-foreground">{formatPreviewDay(line.date).weekday}</span>
					</Table.Cell>
					<Table.Cell><ShiftChip shift={shiftOf(line.before)} /></Table.Cell>
					<Table.Cell>
						{#if line.after !== undefined}
							<span class="inline-flex items-center gap-1">
								<ArrowRightIcon class="size-3 text-muted-foreground rtl:rotate-180" />
								<ShiftChip shift={shiftOf(line.after)} />
							</span>
						{:else}
							<span class="text-muted-foreground">—</span>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	{#if effect.issues.length > 0}
		<div class="flex flex-col gap-1 text-sm text-destructive" role="alert">
			<p class="flex items-center gap-2 font-medium">
				<WarningIcon class="size-4" />
				{m.swap_preview_issues()}
			</p>
			<ul class="flex list-disc flex-col gap-0.5 ps-6">
				{#each effect.issues as issue (issue)}
					<li>{swapIssueText(issue, scope)}</li>
				{/each}
			</ul>
		</div>
	{:else if !applied && effect.moves.length > 0}
		<p class="flex items-center gap-2 text-sm text-success">
			<CheckCircleIcon class="size-4" />
			{m.swap_preview_ok()}
		</p>
	{/if}

	{#if effect.clashes > 0}
		<p class="flex items-start gap-2 text-sm text-warning">
			<WarningIcon class="mt-0.5 size-4 shrink-0" />
			{m.swap_preview_clashes({ count: effect.clashes })}
		</p>
	{/if}
</div>
