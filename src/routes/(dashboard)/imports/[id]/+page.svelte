<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { enhance, type SubmitFunction } from '$app/forms';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { ImportIssue } from '#lib/types/imports.js';
	import { formatDateTime } from '#lib/utils/datetime.js';
	import { personName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Row = (typeof data.batch.rows)[number];

	const KIND_LABEL = {
		staff: m.imports_kind_staff,
		flights: m.imports_kind_flights
	};

	const STATUS_LABEL = {
		previewed: m.imports_status_previewed,
		committed: m.imports_status_committed,
		failed: m.imports_status_failed
	};

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
		team: m.imports_field_team,
		airline_code: m.imports_field_airline_code,
		flight_no: m.imports_field_flight_no,
		direction: m.imports_field_direction,
		origin: m.imports_field_origin,
		destination: m.imports_field_destination,
		scheduled_at: m.imports_field_scheduled_at,
		aircraft_type: m.imports_field_aircraft_type,
		stand: m.imports_field_stand,
		gate: m.imports_field_gate,
		image_url: m.imports_field_image_url
	};

	const ERROR_LABEL: Record<string, () => string> = {
		required: m.imports_error_required,
		invalid_employee_no: m.imports_error_invalid_employee_no,
		duplicate_in_file: m.imports_error_duplicate_in_file,
		unknown_function: m.imports_error_unknown_function,
		unknown_team: m.imports_error_unknown_team,
		invalid_datetime: m.imports_error_invalid_datetime,
		invalid_direction: m.imports_error_invalid_direction,
		invalid_url: m.imports_error_invalid_url
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
		if (value && 'employeeNo' in value) return `${value.employeeNo} · ${value.fullName}`;
		if (value && 'flightNo' in value) {
			const direction =
				value.direction === 'arrival'
					? m.imports_direction_arrival()
					: m.imports_direction_departure();
			return `${value.airlineCode} ${value.flightNo} · ${direction} · ${formatDateTime(
				new Date(value.scheduledAt)
			)}`;
		}
		return Object.values(row.raw ?? {})
			.filter(Boolean)
			.slice(0, 4)
			.join(' · ');
	}

	const actionable = $derived(data.batch.createCount + data.batch.updateCount > 0);

	const submitCommit: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.notice === 'string') {
				toast.success(result.data.notice);
			}
			await update();
		};
	};
</script>

<svelte:head>
	<title>{m.imports_detail_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex items-start gap-3">
			<Button
				variant="ghost"
				size="icon"
				href={localizedHref('/imports')}
				aria-label={m.imports_back()}
			>
				<ArrowLeftIcon />
			</Button>
			<div class="space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-2xl font-semibold tracking-tight" dir="ltr">{data.batch.fileName}</h2>
					<Badge variant={data.batch.status === 'committed' ? 'secondary' : 'outline'}>
						{STATUS_LABEL[data.batch.status]()}
					</Badge>
				</div>
				<p class="text-muted-foreground">
					{KIND_LABEL[data.batch.kind]()} · <bdi>{formatDateTime(data.batch.createdAt)}</bdi> · {data
						.batch.createdByUser
						? personName(data.batch.createdByUser)
						: '—'}
				</p>
			</div>
		</div>

		{#if data.batch.status === 'previewed' && actionable}
			<form method="POST" action="?/commit" use:enhance={submitCommit}>
				<Button type="submit">
					<CheckCircleIcon data-icon="inline-start" />
					{m.imports_commit()}
				</Button>
			</form>
		{/if}
	</div>

	{#if form?.error}
		<p class="text-sm text-destructive" role="alert">{form.error}</p>
	{/if}

	<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
		{#each [{ label: m.imports_total(), value: data.batch.totalRows }, { label: m.imports_created(), value: data.batch.createCount }, { label: m.imports_updated(), value: data.batch.updateCount }, { label: m.imports_skipped(), value: data.batch.skipCount }, { label: m.imports_errors(), value: data.batch.errorCount }] as stat (stat.label)}
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
					{#each data.batch.rows as row (row.id)}
						{@const rowIssues = issues(row)}
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
									<ul class="space-y-1 text-sm text-destructive">
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

	{#if data.batch.status === 'previewed' && !actionable}
		<p class="text-sm text-muted-foreground">{m.imports_nothing_to_commit()}</p>
	{/if}
</section>
