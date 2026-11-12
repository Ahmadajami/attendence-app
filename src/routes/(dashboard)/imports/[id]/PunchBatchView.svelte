<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PunchFilter, getPunchBatchPage } from '#lib/server/services/imports.js';
	import { personName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import { punchReasonLabel, punchWarningLabel } from '../labels.js';
	import BatchHeader from './BatchHeader.svelte';
	import UndoImportDialog from './UndoImportDialog.svelte';

	type View = Awaited<ReturnType<typeof getPunchBatchPage>>;
	type Line = View['lines'][number];

	let { view }: { view: View } = $props();

	const FILTERS: { value: PunchFilter; label: () => string }[] = [
		{ value: 'all', label: m.imports_punch_filter_all },
		{ value: 'import', label: m.imports_punch_filter_import },
		{ value: 'warning', label: m.imports_punch_filter_warning },
		{ value: 'state', label: m.imports_punch_filter_state },
		{ value: 'skipped', label: m.imports_punch_filter_skipped },
		{ value: 'refused', label: m.imports_punch_filter_refused }
	];

	const batch = $derived(view.batch);
	const summary = $derived(batch.summary);
	const skippedTotal = $derived(Object.values(summary?.skipped ?? {}).reduce((a, b) => a + b, 0));
	const refusedTotal = $derived(Object.values(summary?.refused ?? {}).reduce((a, b) => a + b, 0));
	const importLines = $derived((summary?.pairs ?? 0) + (summary?.states ?? 0));
	const stats = $derived([
		{ label: m.imports_punch_lines(), value: summary?.lines ?? batch.totalRows },
		{ label: m.imports_punch_to_import(), value: importLines },
		{ label: m.imports_punch_pairs(), value: summary?.pairs ?? 0 },
		{ label: m.imports_punch_states(), value: summary?.states ?? 0 },
		{ label: m.imports_punch_warned(), value: summary?.warned ?? 0 },
		{ label: m.imports_punch_skipped(), value: skippedTotal },
		{ label: m.imports_punch_refused(), value: refusedTotal },
		{ label: m.imports_punch_people(), value: summary?.people ?? 0 }
	]);
	const reasons = $derived([
		...Object.entries(summary?.skipped ?? {}).map(([code, count]) => ({
			key: `skip-${code}`,
			text: punchReasonLabel(code),
			count,
			refused: false
		})),
		...Object.entries(summary?.refused ?? {}).map(([code, count]) => ({
			key: `refuse-${code}`,
			text: punchReasonLabel(code),
			count,
			refused: true
		}))
	]);
	const warnings = $derived(
		Object.entries(summary?.warnings ?? {}).map(([code, count]) => ({
			code,
			text: punchWarningLabel(code),
			count
		}))
	);

	let filterForm = $state<HTMLFormElement>();
	let show = $derived<string>(view.filter);
	let employee = $derived(view.employee);

	async function apply() {
		await tick();
		filterForm?.requestSubmit();
	}

	function pageHref(page: number) {
		const query = [
			['show', view.filter],
			['page', String(page)],
			...(employee ? [['employee', employee]] : [])
		]
			.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
			.join('&');
		return `${localizedHref('/imports/[id]', { id: batch.id })}?${query}`;
	}

	function filterLabel(value: string) {
		return (FILTERS.find((f) => f.value === value)?.label ?? m.imports_punch_filter_all)();
	}

	function outcome(line: Line): { text: string; variant: 'secondary' | 'outline' | 'destructive' } {
		if (line.errors.length > 0)
			return { text: m.imports_punch_outcome_refuse(), variant: 'destructive' };
		if (line.action === 'create')
			return { text: m.imports_punch_outcome_import(), variant: 'secondary' };
		return { text: m.imports_punch_outcome_skip(), variant: 'outline' };
	}

	function details(line: Line): string[] {
		if (line.errors.length > 0) return line.errors.map((e) => punchReasonLabel(e.code));
		if (line.skipReason) return [punchReasonLabel(line.skipReason)];
		return line.warnings.map(punchWarningLabel);
	}
</script>

<BatchHeader {batch}>
	<div class="flex flex-wrap gap-2">
		{#if batch.status === 'previewed' && importLines > 0}
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

{#if summary?.from && summary.to}
	<p class="text-sm text-muted-foreground">
		<bdi>{m.imports_punch_period({ from: summary.from, to: summary.to })}</bdi>
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

{#if summary}
	<p class="text-sm">
		{m.imports_punch_balance({
			lines: summary.lines,
			imported: importLines,
			skipped: skippedTotal,
			refused: refusedTotal,
			empty: summary.empty
		})}
	</p>
	{#if batch.status !== 'previewed'}
		<p class="text-sm text-muted-foreground">
			{m.imports_punch_written({
				events: summary.events,
				absences: summary.absences,
				voided: summary.undone?.events ?? 0,
				cancelled: summary.undone?.absences ?? 0
			})}
		</p>
	{/if}
{/if}

<div class="grid gap-4 lg:grid-cols-2">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.imports_punch_reasons_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if reasons.length === 0}
				<p class="text-sm text-muted-foreground">{m.imports_punch_reasons_none()}</p>
			{:else}
				<ul class="flex flex-col gap-1 text-sm">
					{#each reasons as reason (reason.key)}
						<li class="flex justify-between gap-4">
							<span class={reason.refused ? 'text-destructive' : ''}>{reason.text}</span>
							<span class="tabular-nums">{reason.count}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.imports_punch_warned()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if warnings.length === 0}
				<p class="text-sm text-muted-foreground">—</p>
			{:else}
				<ul class="flex flex-col gap-1 text-sm">
					{#each warnings as warning (warning.code)}
						<li class="flex justify-between gap-4">
							<span>{warning.text}</span>
							<span class="tabular-nums">{warning.count}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<form
	bind:this={filterForm}
	method="GET"
	class="flex flex-wrap items-end gap-3"
	data-sveltekit-reset="false"
>
	<div class="flex flex-col gap-2">
		<Label for="punch-show">{m.imports_punch_filter()}</Label>
		<Select.Root type="single" name="show" bind:value={show} onValueChange={apply}>
			<Select.Trigger id="punch-show" class="w-52">{filterLabel(show)}</Select.Trigger>
			<Select.Content>
				{#each FILTERS as option (option.value)}
					<Select.Item value={option.value} label={option.label()} />
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="flex flex-col gap-2">
		<Label for="punch-employee">{m.imports_punch_filter_employee()}</Label>
		<Input
			id="punch-employee"
			name="employee"
			inputmode="numeric"
			dir="ltr"
			class="w-44"
			bind:value={employee}
			onchange={apply}
		/>
	</div>
</form>

<Card.Root>
	<Card.Content class="px-0">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">{m.imports_col_row()}</Table.Head>
					<Table.Head>{m.imports_punch_col_person()}</Table.Head>
					<Table.Head>{m.imports_punch_col_date()}</Table.Head>
					<Table.Head>{m.imports_punch_col_times()}</Table.Head>
					<Table.Head>{m.imports_punch_col_planned()}</Table.Head>
					<Table.Head>{m.imports_punch_col_outcome()}</Table.Head>
					<Table.Head>{m.imports_punch_col_detail()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each view.lines as line (line.id)}
					{const result = $derived(outcome(line))}
					{const notes = $derived(details(line))}
					<Table.Row>
						<Table.Cell class="text-muted-foreground tabular-nums">{line.rowNo}</Table.Cell>
						<Table.Cell>
							<div class="flex flex-col">
								<span
									>{line.person ? personName(line.person) : m.imports_punch_unknown_person()}</span
								>
								<span class="text-xs text-muted-foreground" dir="ltr">{line.employeeNo}</span>
							</div>
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap"><bdi>{line.date}</bdi></Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							{#if line.line === 'state'}
								{m.imports_punch_state_line()}
							{:else if line.checkIn}
								<bdi>{line.checkIn} – {line.checkOut ?? m.imports_punch_no_check_out()}</bdi>
							{:else}
								—
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if line.plannedShiftCode}
								<Badge variant="outline">{line.plannedShiftCode}</Badge>
							{:else if line.dayOff}
								{m.imports_punch_day_off()}
							{:else}
								—
							{/if}
						</Table.Cell>
						<Table.Cell><Badge variant={result.variant}>{result.text}</Badge></Table.Cell>
						<Table.Cell>
							{#if notes.length > 0}
								<ul
									class={[
										'flex flex-col gap-0.5 text-sm',
										line.errors.length > 0 ? 'text-destructive' : 'text-muted-foreground'
									]}
								>
									{#each notes as note, index (index)}
										<li>{note}</li>
									{/each}
								</ul>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={7} class="h-20 text-center text-muted-foreground">
							{m.imports_punch_no_lines()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
	<Card.Footer class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-sm text-muted-foreground">
			{m.imports_punch_page({ page: view.page, pages: view.pages, count: view.matching })}
		</p>
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				href={view.page > 1 ? pageHref(view.page - 1) : undefined}
				disabled={view.page <= 1}
			>
				<CaretLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
				{m.imports_punch_prev()}
			</Button>
			<Button
				variant="outline"
				size="sm"
				href={view.page < view.pages ? pageHref(view.page + 1) : undefined}
				disabled={view.page >= view.pages}
			>
				{m.imports_punch_next()}
				<CaretRightIcon data-icon="inline-end" class="rtl:rotate-180" />
			</Button>
		</div>
	</Card.Footer>
</Card.Root>
