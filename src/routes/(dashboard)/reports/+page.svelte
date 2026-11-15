<script lang="ts">
	import { tick } from 'svelte';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import PersonCombobox from '#lib/app/attendance/PersonCombobox.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
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
	import { basePayOf, dayRateOf } from '#lib/reports/totals.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { endSide, lookupName, personName } from '#lib/utils/locale.js';
	import type { PersonDayRow } from '#lib/reports/totals.js';
	import { goto } from '$app/navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const page = $derived(data.page);
	/** The person sheet (R2), open while `person=<id>` is in the URL. */
	const sheet = $derived(data.personSheet);
	const ALL = 'all';
	/** The picked person and the text search, as the combobox posts them (`staff`, `q`). */
	let staff = $derived(page.staffId ?? '');
	let q = $derived(page.q);

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

	/** The monthly salary typed per person (R6, RP13): kept only in this page's memory, never saved, never in the URL or the export. */
	let salaries = $state<Record<string, number>>({});

	/** The typed salary of a person, or `null` while the input is empty or negative. */
	function salaryOf(staffId: string): number | null {
		const value = salaries[staffId];
		return typeof value === 'number' && value >= 0 ? value : null;
	}

	function moneyText(value: number) {
		return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(value);
	}

	/** The day rate: the typed salary ÷ 30; `—` while there is no salary. */
	function dayRateText(staffId: string) {
		const salary = salaryOf(staffId);
		return salary === null ? '—' : moneyText(dayRateOf(salary));
	}

	/** The base pay: the day rate × the work days in the range (overtime and shortage are not in it yet). */
	function basePayText(staffId: string, workDays: number) {
		const salary = salaryOf(staffId);
		return salary === null ? '—' : moneyText(basePayOf(salary, workDays));
	}

	/** The deduction switch (R6, RP22): off by default, frontend only, never in the URL or the export. */
	let deductShortage = $state(false);

	/** Overtime pay: the day rate × the person's overtime coefficient (RP19–RP23). */
	function overtimePayText(staffId: string, coefficient: number) {
		const salary = salaryOf(staffId);
		return salary === null ? '—' : moneyText(dayRateOf(salary) * coefficient);
	}

	/** The shortage deduction: the day rate × the shortage coefficient, shown only when the switch is on. */
	function deductionText(staffId: string, coefficient: number) {
		const salary = salaryOf(staffId);
		return salary === null ? '—' : moneyText(dayRateOf(salary) * coefficient);
	}

	/** The credit extra pay (RP24): the day rate × the credit coefficient, paid as extra time. */
	function creditPayText(staffId: string, coefficient: number) {
		const salary = salaryOf(staffId);
		return salary === null ? '—' : moneyText(dayRateOf(salary) * coefficient);
	}

	/** The total: base pay + overtime pay + credit pay − the deduction when the switch is on. */
	function totalPayText(
		staffId: string,
		workDays: number,
		overtime: number,
		shortage: number,
		credit: number
	) {
		const salary = salaryOf(staffId);
		if (salary === null) return '—';
		const deduction = deductShortage ? dayRateOf(salary) * shortage : 0;
		return moneyText(
			basePayOf(salary, workDays) + dayRateOf(salary) * (overtime + credit) - deduction
		);
	}

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
			['staff', page.staffId ?? ''],
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

	/** A name opens the person sheet for that person, with the shown dates, scope and filters. */
	function personHref(staffId: string) {
		return `${localizedHref('/reports')}?${queryOf()}&person=${encodeURIComponent(staffId)}`;
	}

	/** The sheet's day sort: the same sheet, the other direction. */
	function sheetSortHref(dir: TotalsSortDir) {
		const staffId = sheet?.person.staffId ?? '';
		return `${localizedHref('/reports')}?${queryOf()}&person=${encodeURIComponent(staffId)}&pdir=${dir}`;
	}

	/** Closing the sheet removes only `person` and `pdir` from the URL. */
	function closeSheet(open: boolean) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref resolves it
		if (!open) void goto(`${localizedHref('/reports')}?${queryOf()}`, { reset: false });
	}

	/** The plain reason of a day's overtime (RP6): never an absence type or a health detail. */
	function reasonText(day: PersonDayRow): string {
		switch (day.reason) {
			case 'paid':
				return m.reports_ot_reason_paid({ rate: String(day.otRate ?? '') });
			case 'ot_off':
				return m.reports_ot_reason_ot_off();
			case 'person_no_ot':
				return m.reports_ot_reason_person_no_ot();
			case 'holiday_not_eligible':
				return m.reports_ot_reason_holiday_not_eligible();
			case 'absence':
				return m.reports_ot_reason_absence();
			case 'none':
				return m.reports_ot_reason_none();
		}
	}

	/** Signed minutes as `+h:mm` / `−h:mm`, the way the Odoo summary shows overtime and balance (RP15). */
	function signedText(minutes: number) {
		return `${minutes < 0 ? '−' : minutes > 0 ? '+' : ''}${formatHoursMinutes(Math.abs(minutes))}`;
	}

	/** A cell's text: day counts as they are, overtime and balance signed, other minutes as `h:mm`. */
	function cellText(totals: PersonTotals, column: TotalsColumn) {
		if (COUNT_COLUMNS.includes(column)) return String(totals[column]);
		if (column === 'overtimeMinutes' || column === 'balanceMinutes')
			return signedText(totals[column]);
		return formatHoursMinutes(totals[column]);
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
				<Label for="reports-person">{m.reports_search_label()}</Label>
				<!-- Submits on a pick or a clear, like the daily page's person filter. -->
				<PersonCombobox
					id="reports-person"
					class="w-64"
					bind:staff
					bind:q
					person={page.person}
					onchange={apply}
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
			<div class="flex flex-col gap-2">
				<Label for="reports-cap">{m.reports_cap_label()}</Label>
				<Input
					id="reports-cap"
					type="number"
					name="cap"
					min="0"
					step="any"
					value={page.cap ?? ''}
					placeholder={m.reports_cap_placeholder()}
					onchange={apply}
					class="w-40"
				/>
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

	<!-- Outside the GET form on purpose: the switch is not in the URL or the export (RP22). -->
	<div class="flex items-center gap-3">
		<Switch id="reports-deduct" bind:checked={deductShortage} />
		<Label for="reports-deduct">{m.reports_deduct_shortage()}</Label>
	</div>

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
						{#if page.cap !== null}
							<Table.Head class="text-end">{m.reports_col_capped()}</Table.Head>
						{/if}
						<Table.Head class="text-end">{m.reports_col_salary()}</Table.Head>
						<Table.Head class="text-end">{m.reports_col_day_rate()}</Table.Head>
						<Table.Head class="text-end">{m.reports_col_base_pay()}</Table.Head>
						<Table.Head class="text-end">{m.reports_col_overtime_pay()}</Table.Head>
						<Table.Head class="text-end">{m.reports_col_credit_pay()}</Table.Head>
						{#if deductShortage}
							<Table.Head class="text-end">{m.reports_col_deduction()}</Table.Head>
						{/if}
						<Table.Head class="text-end">{m.reports_col_total_pay()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each page.rows as row (row.person.staffId)}
						{const href = $derived(daysHref(row.person.staffId))}
						<Table.Row>
							<Table.Cell>
								<!-- A name opens the person sheet (R2); the numbers open the daily page. -->
								<Button
									variant="link"
									class="h-auto p-0 font-medium"
									href={personHref(row.person.staffId)}
									data-sveltekit-noscroll
								>
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
							{#if page.cap !== null}
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{formatHoursMinutes(row.overtime.cappedMinutes)}</bdi>
								</Table.Cell>
							{/if}
							<Table.Cell class="text-end">
								<Input
									type="number"
									min="0"
									step="any"
									class="ms-auto w-32"
									aria-label={m.reports_col_salary()}
									bind:value={salaries[row.person.staffId]}
								/>
							</Table.Cell>
							<Table.Cell class="text-end font-mono">
								<bdi dir="ltr">{dayRateText(row.person.staffId)}</bdi>
							</Table.Cell>
							<Table.Cell class="text-end font-mono">
								<bdi dir="ltr">{basePayText(row.person.staffId, row.totals.workDays)}</bdi>
							</Table.Cell>
							<Table.Cell class="text-end font-mono">
								<bdi dir="ltr">{overtimePayText(row.person.staffId, row.pay.overtime)}</bdi>
							</Table.Cell>
							<Table.Cell class="text-end font-mono">
								<bdi dir="ltr">{creditPayText(row.person.staffId, row.pay.credit)}</bdi>
							</Table.Cell>
							{#if deductShortage}
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{deductionText(row.person.staffId, row.pay.shortage)}</bdi>
								</Table.Cell>
							{/if}
							<Table.Cell class="text-end font-mono">
								<bdi dir="ltr">
									{totalPayText(
										row.person.staffId,
										row.totals.workDays,
										row.pay.overtime,
										row.pay.shortage,
										row.pay.credit
									)}
								</bdi>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell
								colspan={page.columns.length +
									7 +
									(page.cap !== null ? 1 : 0) +
									(deductShortage ? 1 : 0)}
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

{#if sheet}
	<Sheet.Root open onOpenChange={closeSheet}>
		<Sheet.Content side={endSide()} class="w-full overflow-y-auto sm:max-w-5xl">
			<Sheet.Header>
				<Sheet.Title>{personName(sheet.person)}</Sheet.Title>
				<Sheet.Description>{m.reports_sheet_description()}</Sheet.Description>
			</Sheet.Header>
			<div class="overflow-x-auto px-4 pb-4">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head aria-sort={sheet.dir === 'asc' ? 'ascending' : 'descending'}>
								<Button
									variant="ghost"
									size="sm"
									class="-ms-2"
									href={sheetSortHref(sheet.dir === 'asc' ? 'desc' : 'asc')}
									data-sveltekit-noscroll
								>
									{m.reports_sheet_col_day()}
									{#if sheet.dir === 'asc'}
										<ArrowUpIcon data-icon="inline-end" />
									{:else}
										<ArrowDownIcon data-icon="inline-end" />
									{/if}
								</Button>
							</Table.Head>
							<Table.Head>{m.reports_sheet_col_shift()}</Table.Head>
							<Table.Head class="text-end">{TOTALS_COLUMN_LABEL.requiredMinutes()}</Table.Head>
							<Table.Head class="text-end">{TOTALS_COLUMN_LABEL.workedMinutes()}</Table.Head>
							<Table.Head class="text-end">{TOTALS_COLUMN_LABEL.overtimeMinutes()}</Table.Head>
							<Table.Head class="text-end">{m.reports_sheet_col_paid()}</Table.Head>
							<Table.Head class="text-end">{m.reports_sheet_col_unpaid()}</Table.Head>
							<Table.Head class="text-end">{TOTALS_COLUMN_LABEL.lateMinutes()}</Table.Head>
							<Table.Head class="text-end">{TOTALS_COLUMN_LABEL.shortageMinutes()}</Table.Head>
							<Table.Head>{m.reports_sheet_col_reason()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each sheet.days as day (day.shiftDate)}
							<Table.Row>
								<Table.Cell>
									<bdi>{formatCalendarDate(day.shiftDate)}</bdi>
								</Table.Cell>
								<Table.Cell>{day.shift ? lookupName(day.shift) : '—'}</Table.Cell>
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{formatHoursMinutes(day.requiredMinutes)}</bdi>
								</Table.Cell>
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">
										{day.workedMinutes === null ? '—' : formatHoursMinutes(day.workedMinutes)}
									</bdi>
								</Table.Cell>
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{formatHoursMinutes(day.overtimeMinutes)}</bdi>
								</Table.Cell>
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{formatHoursMinutes(day.paidOtMinutes)}</bdi>
								</Table.Cell>
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{formatHoursMinutes(day.unpaidExtraMinutes)}</bdi>
								</Table.Cell>
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{formatHoursMinutes(day.lateMinutes)}</bdi>
								</Table.Cell>
								<Table.Cell class="text-end font-mono">
									<bdi dir="ltr">{formatHoursMinutes(day.shortageMinutes)}</bdi>
								</Table.Cell>
								<Table.Cell class="whitespace-normal">{reasonText(day)}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={10} class="h-20 text-center text-muted-foreground">
									{m.reports_sheet_empty()}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
