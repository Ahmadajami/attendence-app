<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { getRosterBatchView } from '#lib/server/services/imports.js';
	import type { ShiftBatchSummary, ShiftImportData } from '#lib/types/imports.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import { punchReasonLabel } from '../labels.js';
	import BatchHeader from './BatchHeader.svelte';
	import UndoImportDialog from './UndoImportDialog.svelte';

	type View = Awaited<ReturnType<typeof getRosterBatchView>>;
	type Row = View['batch']['rows'][number];

	let { view }: { view: View } = $props();

	const batch = $derived(view.batch);
	const summary = $derived(batch.summary as ShiftBatchSummary | null);
	const refused = $derived(Object.values(summary?.refused ?? {}).reduce((a, b) => a + b, 0));
	const stats = $derived([
		{ label: m.imports_shift_create(), value: summary?.create ?? 0 },
		{ label: m.imports_shift_same(), value: summary?.same ?? 0 },
		{ label: m.imports_shift_refused(), value: refused }
	]);

	const shiftOf = (row: Row) =>
		row.parsed && 'line' in row.parsed && row.parsed.line === 'shift'
			? (row.parsed as ShiftImportData)
			: null;

	function outcome(row: Row): { text: string; variant: 'secondary' | 'outline' | 'destructive' } {
		if ((row.errors ?? []).length > 0)
			return { text: m.imports_shift_refused(), variant: 'destructive' };
		if (row.action === 'create') return { text: m.imports_shift_create(), variant: 'secondary' };
		return { text: m.imports_shift_same(), variant: 'outline' };
	}
</script>

<BatchHeader {batch}>
	<div class="flex flex-wrap gap-2">
		{#if batch.status === 'previewed' && (summary?.create ?? 0) > 0}
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

<div class="grid grid-cols-3 gap-2">
	{#each stats as stat (stat.label)}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-xs text-muted-foreground">{stat.label}</p>
				<p class="text-2xl font-semibold tabular-nums">{stat.value}</p>
			</Card.Content>
		</Card.Root>
	{/each}
</div>

{#if summary?.deactivated !== undefined}
	<p class="text-sm text-muted-foreground">
		{m.imports_shift_undone({ count: summary.deactivated })}
	</p>
{/if}

<Card.Root>
	<Card.Content class="px-0">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">{m.imports_col_row()}</Table.Head>
					<Table.Head>{m.imports_shift_col_code()}</Table.Head>
					<Table.Head>{m.imports_shift_col_name()}</Table.Head>
					<Table.Head>{m.imports_shift_col_times()}</Table.Head>
					<Table.Head>{m.imports_shift_col_required()}</Table.Head>
					<Table.Head>{m.imports_punch_col_outcome()}</Table.Head>
					<Table.Head>{m.imports_punch_col_detail()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each batch.rows as row (row.id)}
					{const shift = $derived(shiftOf(row))}
					{const result = $derived(outcome(row))}
					<Table.Row>
						<Table.Cell class="text-muted-foreground tabular-nums">{row.rowNo}</Table.Cell>
						<Table.Cell class="font-medium" dir="ltr">{shift?.code ?? '—'}</Table.Cell>
						<Table.Cell>
							{#if shift}
								<div class="flex flex-col">
									<span>{shift.nameEn}</span>
									<span class="text-xs text-muted-foreground">{shift.nameAr}</span>
								</div>
							{:else}
								—
							{/if}
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							{#if shift}<bdi>{shift.startTime} – {shift.endTime}</bdi>{:else}—{/if}
						</Table.Cell>
						<Table.Cell class="tabular-nums">{shift?.requiredMinutes ?? '—'}</Table.Cell>
						<Table.Cell><Badge variant={result.variant}>{result.text}</Badge></Table.Cell>
						<Table.Cell class="text-sm">
							{#each row.errors ?? [] as issue, index (index)}
								<p class="text-destructive">{punchReasonLabel(issue.code, issue.field)}</p>
							{:else}
								<span class="text-muted-foreground"
									>{shift?.skipReason ? punchReasonLabel(shift.skipReason) : '—'}</span
								>
							{/each}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={7} class="h-20 text-center text-muted-foreground">
							{m.imports_no_rows()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
