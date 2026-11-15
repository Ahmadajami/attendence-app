<script lang="ts">
	import { tick } from 'svelte';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		COUNT_COLUMNS,
		monthRange,
		payMonthRange,
		TOTALS_COLUMNS,
		TOTALS_COLUMN_LABEL,
		type PersonTotals,
		type TotalsColumn,
		type TotalsSortDir,
		type TotalsSortKey
	} from '#lib/reports/totals.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const page = $derived(data.page);
	const ALL = 'all';

	const scopeValue = $derived(
		!page.scope
			? ALL
			: 'departmentId' in page.scope
				? `department:${page.scope.departmentId}`
				: `team:${page.scope.teamId}`
	);
	const scopeLabel = (value: string) => {
		if (value === ALL) return m.daily_scope_everyone();
		const [kind, id] = value.split(':');
		const row =
			kind === 'department'
				? page.departments.find((d) => d.id === id)
				: page.teams.find((t) => t.id === id);
		return row ? lookupName(row) : m.daily_scope_everyone();
	};

	let filter: HTMLFormElement | undefined = $state();
	/** The picked scope; follows the URL after each navigation. */
	let scope = $derived(scopeValue);
	/** The shown range: exactly the picked dates; reset from each load. */
	let fromValue = $derived(page.from);
	let toValue = $derived(page.to);

	/** The filters and columns live in the URL (GET form), so the page survives a reload. */
	async function apply() {
		await tick();
		filter?.requestSubmit();
	}

	/**
	 * The report's query: the shown filters, sort and search and the chosen columns, with any of
	 * `overrides` replaced. Links (quick ranges, sort headers) and the export use it, so they keep
	 * the rest of the view.
	 */
	function queryOf(
		overrides: Partial<{ from: string; to: string; sort: TotalsSortKey; dir: TotalsSortDir }> = {}
	) {
		const shown = {
			from: page.from,
			to: page.to,
			sort: page.sort.key,
			dir: page.sort.dir,
			...overrides
		};
		return [
			['from', shown.from],
			['to', shown.to],
			['scope', scopeValue === ALL ? '' : scopeValue],
			['sort', shown.sort],
			['dir', shown.dir],
			['q', page.q],
			['cap', page.cap === null ? '' : String(page.cap)],
			...page.columns.map((column) => ['col', column] as const)
		]
			.filter(([, value]) => value !== '')
			.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
			.join('&');
	}

	/** A quick range (SP6) navigates to the report with both dates set. */
	function quickHref(range: { from: string; to: string }) {
		return `${localizedHref('/reports')}?${queryOf(range)}`;
	}

	/** The Excel export of exactly the shown rows, sort, search and columns. */
	const exportHref = $derived(`${localizedHref('/reports/export')}?${queryOf()}`);

	/** A column heading's link: the first click sorts ascending, the next one descending (R1). */
	function sortHref(key: TotalsSortKey) {
		const dir: TotalsSortDir = page.sort.key === key && page.sort.dir === 'asc' ? 'desc' : 'asc';
		return `${localizedHref('/reports')}?${queryOf({ sort: key, dir })}`;
	}

	/** The `aria-sort` value of a heading, and its arrow when it is the sort column. */
	function ariaSort(key: TotalsSortKey): 'ascending' | 'descending' | 'none' {
		if (page.sort.key !== key) return 'none';
		return page.sort.dir === 'asc' ? 'ascending' : 'descending';
	}

	/** The daily page of this person and the shown dates: what every number opens. */
	function daysHref(staffId: string) {
		return `${localizedHref('/attendance/days')}?from=${encodeURIComponent(page.from)}&to=${encodeURIComponent(page.to)}&staff=${encodeURIComponent(staffId)}`;
	}

	/** A cell's text: day counts as they are, minutes as `h:mm`. */
	function cellText(totals: PersonTotals, column: TotalsColumn) {
		return COUNT_COLUMNS.includes(column)
			? String(totals[column])
			: formatHoursMinutes(totals[column]);
	}
</script>

<svelte:head>
	<title>{m.reports_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.reports_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.reports_description()}</p>
	</div>

	<!-- The filters and columns live in the URL (GET form), so the page survives a reload. -->
	<form
		method="GET"
		class="flex flex-col gap-3"
		data-sveltekit-reset="false"
		{@attach (element) => {
			filter = element;
		}}
	>
		<!-- The sort is kept by the form too, so changing a filter keeps the order. -->
		<input type="hidden" name="sort" value={page.sort.key} />
		<input type="hidden" name="dir" value={page.sort.dir} />
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex flex-col gap-2">
				<Label for="reports-from">{m.daily_field_from()}</Label>
				<Input
					id="reports-from"
					type="date"
					name="from"
					bind:value={fromValue}
					onchange={apply}
					class="w-44"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<Label for="reports-to">{m.daily_field_to()}</Label>
				<Input
					id="reports-to"
					type="date"
					name="to"
					bind:value={toValue}
					onchange={apply}
					class="w-44"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<Label for="reports-q">{m.reports_search_label()}</Label>
				<Input
					id="reports-q"
					type="search"
					name="q"
					value={page.q}
					placeholder={m.reports_search_placeholder()}
					onchange={apply}
					class="w-64"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<Label for="reports-scope">{m.attendance_field_scope()}</Label>
				<Select.Root type="single" name="scope" bind:value={scope} onValueChange={apply}>
					<Select.Trigger id="reports-scope" class="w-64">{scopeLabel(scope)}</Select.Trigger>
					<Select.Content>
						<Select.Item value={ALL} label={m.daily_scope_everyone()} />
						<Select.Group>
							<Select.Label>{m.nav_departments()}</Select.Label>
							{#each page.departments as department (department.id)}
								<Select.Item
									value={`department:${department.id}`}
									label={lookupName(department)}
									class="ps-[calc(0.5rem+var(--depth)*1rem)]"
									style={`--depth: ${department.depth}`}
								/>
							{/each}
						</Select.Group>
						<Select.Group>
							<Select.Label>{m.nav_teams()}</Select.Label>
							{#each page.teams as team (team.id)}
								<Select.Item value={`team:${team.id}`} label={lookupName(team)} />
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
			</div>
			<!-- Quick ranges (SP6): navigation links, so they keep the scope and the columns. -->
			<Button variant="outline" size="sm" href={quickHref(monthRange(page.today))}>
				{m.reports_quick_this_month()}
			</Button>
			<Button variant="outline" size="sm" href={quickHref(payMonthRange(page.today))}>
				<bdi dir="ltr">{m.reports_quick_pay_month()}</bdi>
			</Button>
			<noscript><button type="submit">{m.attendance_show()}</button></noscript>
		</div>
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<span class="text-sm font-medium">{m.reports_columns_label()}</span>
			{#each TOTALS_COLUMNS as column (column)}
				{let checked = $derived(page.columns.includes(column))}
				<div class="flex items-center gap-2">
					<Checkbox
						id={`reports-col-${column}`}
						name="col"
						value={column}
						bind:checked
						onCheckedChange={apply}
					/>
					<Label for={`reports-col-${column}`} class="font-normal"
						>{TOTALS_COLUMN_LABEL[column]()}</Label
					>
				</div>
			{/each}
		</div>
	</form>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.reports_rows_title({ count: page.rows.length })}</Card.Title>
			<Card.Description>{m.reports_rows_description()}</Card.Description>
			<Card.Action>
				<Button variant="outline" size="sm" href={exportHref}>
					<DownloadSimpleIcon data-icon="inline-start" />
					{m.reports_export()}
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head aria-sort={ariaSort('name')}>
							<Button variant="ghost" size="sm" class="-ms-2" href={sortHref('name')}>
								{m.attendance_col_person()}
								{#if page.sort.key === 'name'}
									{#if page.sort.dir === 'asc'}
										<ArrowUpIcon data-icon="inline-end" />
									{:else}
										<ArrowDownIcon data-icon="inline-end" />
									{/if}
								{/if}
							</Button>
						</Table.Head>
						{#each page.columns as column (column)}
							<Table.Head class="text-end" aria-sort={ariaSort(column)}>
								<Button variant="ghost" size="sm" class="-me-2" href={sortHref(column)}>
									{TOTALS_COLUMN_LABEL[column]()}
									{#if page.sort.key === column}
										{#if page.sort.dir === 'asc'}
											<ArrowUpIcon data-icon="inline-end" />
										{:else}
											<ArrowDownIcon data-icon="inline-end" />
										{/if}
									{/if}
								</Button>
							</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each page.rows as row (row.person.staffId)}
						{const href = $derived(daysHref(row.person.staffId))}
						<Table.Row>
							<Table.Cell>
								<!-- Opens the daily page filtered to this person and the shown dates. -->
								<Button variant="link" class="h-auto p-0 font-medium" {href}>
									{personName(row.person)}
								</Button>
								<div>
									<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
										{row.person.employeeNo}
									</bdi>
								</div>
							</Table.Cell>
							{#each page.columns as column (column)}
								<Table.Cell class="text-end">
									<Button variant="link" class="h-auto p-0 font-mono" {href}>
										<bdi dir="ltr">{cellText(row.totals, column)}</bdi>
									</Button>
								</Table.Cell>
							{/each}
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell
								colspan={page.columns.length + 1}
								class="h-20 text-center text-muted-foreground"
							>
								{m.reports_rows_empty()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>
