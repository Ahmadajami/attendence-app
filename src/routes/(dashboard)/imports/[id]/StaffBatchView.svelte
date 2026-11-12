<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { getImportBatch } from '#lib/server/services/imports.js';
	import type { ImportIssue } from '#lib/types/imports.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import BatchHeader from './BatchHeader.svelte';

	type Batch = Awaited<ReturnType<typeof getImportBatch>>;
	type Row = Batch['rows'][number];

	let { batch }: { batch: Batch } = $props();

	const ACTION_LABEL = {
		create: m.imports_action_create,
		update: m.imports_action_update,
		skip: m.imports_action_skip
	};

	const FIELD_LABEL: Record<string, () => string> = {
		employee_no: m.imports_field_employee_no,
		full_name: m.imports_field_full_name,
		full_name_ar: m.imports_field_full_name_ar,
		phone: m.imports_field_phone,
		function: m.imports_field_function,
		team: m.imports_field_team
	};

	const ERROR_LABEL: Record<string, () => string> = {
		required: m.imports_error_required,
		invalid_employee_no: m.imports_error_invalid_employee_no,
		duplicate_in_file: m.imports_error_duplicate_in_file,
		unknown_function: m.imports_error_unknown_function,
		unknown_team: m.imports_error_unknown_team
	};

	function issues(row: Row): ImportIssue[] {
		return row.errors ?? [];
	}

	function fieldLabel(field: string) {
		return (FIELD_LABEL[field] ?? (() => field))();
	}

	function errorLabel(code: string) {
		return (ERROR_LABEL[code] ?? (() => code))();
	}

	function rowLabel(row: Row) {
		const value = row.parsed;
		if (value && 'fullName' in value) return `${value.employeeNo} · ${value.fullName}`;
		return Object.values(row.raw ?? {})
			.filter(Boolean)
			.slice(0, 4)
			.join(' · ');
	}

	const actionable = $derived(batch.createCount + batch.updateCount > 0);
	const stats = $derived([
		{ label: m.imports_total(), value: batch.totalRows },
		{ label: m.imports_created(), value: batch.createCount },
		{ label: m.imports_updated(), value: batch.updateCount },
		{ label: m.imports_skipped(), value: batch.skipCount },
		{ label: m.imports_errors(), value: batch.errorCount }
	]);
</script>

<BatchHeader {batch}>
	{#if batch.status === 'previewed' && actionable}
		<form method="POST" action="?/commit" use:enhance={toastNotice}>
			<Button type="submit">
				<CheckCircleIcon data-icon="inline-start" />
				{m.imports_commit()}
			</Button>
		</form>
	{/if}
</BatchHeader>

<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
	{#each stats as stat (stat.label)}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-xs text-muted-foreground">{stat.label}</p>
				<p class="text-2xl font-semibold tabular-nums">{stat.value}</p>
			</Card.Content>
		</Card.Root>
	{/each}
</div>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.imports_rows_title()}</Card.Title>
		<Card.Description>{m.imports_rows_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="px-0">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">{m.imports_col_row()}</Table.Head>
					<Table.Head>{m.imports_col_data()}</Table.Head>
					<Table.Head>{m.imports_col_action()}</Table.Head>
					<Table.Head>{m.imports_col_issues()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each batch.rows as row (row.id)}
					{const rowIssues = $derived(issues(row))}
					<Table.Row>
						<Table.Cell class="text-muted-foreground tabular-nums">{row.rowNo}</Table.Cell>
						<Table.Cell class="max-w-md">{rowLabel(row)}</Table.Cell>
						<Table.Cell>
							<Badge
								variant={row.action === 'create'
									? 'secondary'
									: row.action === 'update'
										? 'default'
										: 'outline'}
							>
								{ACTION_LABEL[row.action]()}
							</Badge>
						</Table.Cell>
						<Table.Cell>
							{#if rowIssues.length > 0}
								<ul class="flex flex-col gap-1 text-sm text-destructive">
									{#each rowIssues as issue, index (index)}
										<li>
											<span class="font-medium">{fieldLabel(issue.field)}:</span>
											{errorLabel(issue.code)}
											{#if issue.value}
												<span class="text-muted-foreground" dir="ltr">({issue.value})</span>
											{/if}
										</li>
									{/each}
								</ul>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={4} class="h-20 text-center text-muted-foreground">
							{m.imports_no_rows()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

{#if batch.status === 'previewed' && !actionable}
	<p class="text-sm text-muted-foreground">{m.imports_nothing_to_commit()}</p>
{/if}
