<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { getRosterBatchView } from '#lib/server/services/imports.js';
	import type { RosterBatchSummary, RosterImportData } from '#lib/types/imports.js';
	import { personName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import { punchReasonLabel } from '../labels.js';
	import BatchHeader from './BatchHeader.svelte';
	import UndoImportDialog from './UndoImportDialog.svelte';

	type View = Awaited<ReturnType<typeof getRosterBatchView>>;
	type Row = View['batch']['rows'][number];

	let { view }: { view: View } = $props();

	const batch = $derived(view.batch);
	const summary = $derived(batch.summary as RosterBatchSummary | null);
	const refused = $derived(Object.values(summary?.refused ?? {}).reduce((a, b) => a + b, 0));
	const savedGroups = $derived((summary?.groups ?? []).filter((g) => !g.refused && g.people > 0));
	const stats = $derived([
		{ label: m.imports_roster_people(), value: summary?.people ?? 0 },
		{ label: m.imports_roster_groups(), value: savedGroups.length },
		{ label: m.imports_roster_patterns(), value: summary?.patterns ?? 0 },
		{ label: m.imports_roster_own_rules(), value: summary?.ownRules ?? 0 },
		{ label: m.imports_roster_swaps(), value: summary?.swaps ?? 0 },
		{ label: m.imports_roster_day_edits(), value: summary?.dayEdits ?? 0 },
		{ label: m.imports_roster_mismatches(), value: summary?.mismatches ?? 0 },
		{ label: m.imports_roster_refused(), value: refused }
	]);
	const canSave = $derived(
		batch.status === 'previewed' && (summary?.people ?? 0) > 0 && summary?.mismatches === 0
	);

	/** Weekday short names in the page's language, Sunday first. */
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) =>
			new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' }).format(
				new Date(Date.UTC(2026, 10, 1 + i))
			)
		)
	);

	const dataOf = (row: Row) =>
		row.parsed && 'line' in row.parsed && row.parsed.line === 'roster'
			? (row.parsed as RosterImportData)
			: null;

	function nameOf(row: Row) {
		const id = dataOf(row)?.staffId;
		const person = id ? view.names[id] : undefined;
		return person ? personName(person) : m.imports_punch_unknown_person();
	}
</script>

<BatchHeader {batch}>
	<div class="flex flex-wrap gap-2">
		{#if canSave}
			<form method="POST" action="?/commit" use:enhance={toastNotice}>
				<Button type="submit">
					<CheckCircleIcon data-icon="inline-start" />
					{m.imports_commit()}
				</Button>
			</form>
		{/if}
		{#if batch.status === 'committed'}
			<UndoImportDialog />
		{/if}
	</div>
</BatchHeader>

{#if summary}
	<p class="text-sm text-muted-foreground">
		<bdi>{m.imports_roster_period({ from: summary.from, to: summary.to })}</bdi>
	</p>
{/if}

<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
	{#each stats as stat (stat.label)}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-xs text-muted-foreground">{stat.label}</p>
				<p class="text-2xl font-semibold tabular-nums">{stat.value}</p>
			</Card.Content>
		</Card.Root>
	{/each}
</div>

{#if summary && batch.status === 'previewed'}
	<p class={['text-sm', summary.mismatches > 0 && 'text-destructive']}>
		{summary.mismatches === 0 ? m.imports_roster_ok() : m.imports_roster_not_ok()}
	</p>
{/if}
{#if summary?.undone}
	<p class="text-sm text-muted-foreground">{m.imports_roster_written(summary.undone)}</p>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>{m.imports_roster_groups_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="px-0">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.imports_roster_col_group()}</Table.Head>
					<Table.Head>{m.imports_roster_people()}</Table.Head>
					<Table.Head>{m.imports_roster_col_pattern()}</Table.Head>
					<Table.Head>{m.imports_roster_own_rules()}</Table.Head>
					<Table.Head>{m.imports_roster_col_personal()}</Table.Head>
					<Table.Head>{m.imports_roster_swaps()}</Table.Head>
					<Table.Head>{m.imports_roster_day_edits()}</Table.Head>
					<Table.Head>{m.imports_roster_mismatches()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each summary?.groups ?? [] as group (group.key)}
					<Table.Row>
						<Table.Cell>
							<div class="flex flex-col">
								<span class="font-medium">{group.label}</span>
								<span class="text-xs text-muted-foreground">
									{group.kind === 'department'
										? m.imports_roster_kind_department()
										: m.imports_roster_kind_team()}
								</span>
								{#if group.refused}
									<span class="text-xs text-destructive">
										{m.imports_roster_group_refused()}: {punchReasonLabel(group.refused)}
									</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell>
							<div class="flex flex-col">
								<span class="tabular-nums">{group.people}</span>
								{#if group.unlisted > 0}
									<span class="text-xs text-muted-foreground">
										{m.imports_roster_unlisted({ count: group.unlisted })}
									</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell>
							<div class="flex flex-wrap gap-1" dir="ltr">
								{#each group.slots as code, index (index)}
									<Badge variant={code === 'O' ? 'outline' : 'secondary'} title={weekdays[index]}>
										{code}
									</Badge>
								{/each}
							</div>
						</Table.Cell>
						<Table.Cell class="tabular-nums">{group.ownRules}</Table.Cell>
						<Table.Cell>
							{#each group.personal as personal (personal.name)}
								<p class="text-sm">
									{personal.name} <span class="text-muted-foreground">({personal.people})</span>
								</p>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/each}
						</Table.Cell>
						<Table.Cell class="tabular-nums">{group.swaps}</Table.Cell>
						<Table.Cell class="tabular-nums">{group.dayEdits}</Table.Cell>
						<Table.Cell class={['tabular-nums', group.mismatches > 0 && 'text-destructive']}>
							{group.mismatches}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.imports_roster_people_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="px-0">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">{m.imports_col_row()}</Table.Head>
					<Table.Head>{m.imports_punch_col_person()}</Table.Head>
					<Table.Head>{m.imports_roster_col_group()}</Table.Head>
					<Table.Head>{m.imports_roster_col_planned()}</Table.Head>
					<Table.Head>{m.imports_roster_col_own()}</Table.Head>
					<Table.Head>{m.imports_roster_col_personal()}</Table.Head>
					<Table.Head>{m.imports_roster_swaps()}</Table.Head>
					<Table.Head>{m.imports_roster_day_edits()}</Table.Head>
					<Table.Head>{m.imports_punch_col_detail()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each batch.rows as row (row.id)}
					{const data = $derived(dataOf(row))}
					<Table.Row>
						<Table.Cell class="text-muted-foreground tabular-nums">{row.rowNo}</Table.Cell>
						<Table.Cell>
							<div class="flex flex-col">
								<span>{nameOf(row)}</span>
								<span class="text-xs text-muted-foreground" dir="ltr">{data?.employeeNo ?? ''}</span
								>
							</div>
						</Table.Cell>
						<Table.Cell>{data?.group ?? '—'}</Table.Cell>
						<Table.Cell class="tabular-nums">{data?.plannedDays ?? '—'}</Table.Cell>
						<Table.Cell>
							{data?.ownOffWeekdays
								? data.ownOffWeekdays.map((w) => weekdays[w]).join(' ') || '—'
								: '—'}
						</Table.Cell>
						<Table.Cell class="text-sm">{data?.personalPattern ?? '—'}</Table.Cell>
						<Table.Cell class="tabular-nums">{data?.swaps ?? 0}</Table.Cell>
						<Table.Cell class="tabular-nums">{data?.dayEdits ?? 0}</Table.Cell>
						<Table.Cell class="text-sm">
							{#each row.errors ?? [] as issue, index (index)}
								<p class="text-destructive">{punchReasonLabel(issue.code)}</p>
							{:else}
								{#if (data?.mismatches ?? 0) > 0}
									<p class="text-destructive">
										{m.imports_roster_mismatches()}: {data?.mismatches}
									</p>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							{/each}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={9} class="h-20 text-center text-muted-foreground">
							{m.imports_no_rows()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
