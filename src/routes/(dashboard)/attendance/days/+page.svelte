<script lang="ts">
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
	import ClockCounterClockwiseIcon from 'phosphor-svelte/lib/ClockCounterClockwiseIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import DayBadges from '#lib/app/attendance/DayBadges.svelte';
	import DayHistorySheet from '#lib/app/attendance/DayHistorySheet.svelte';
	import { DAILY_SOURCE_LABEL, DAY_STATUS_LABEL } from '#lib/app/attendance/day-labels.js';
	import DayStateSheet from '#lib/app/attendance/DayStateSheet.svelte';
	import OvertimeCell from '#lib/app/attendance/OvertimeCell.svelte';
	import PunchTime from '#lib/app/attendance/PunchTime.svelte';
	import RecomputeCard from '#lib/app/attendance/RecomputeCard.svelte';
	import { formatCalendarDate, formatPreviewDay } from '#lib/app/roster/labels.js';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
	import { MAX_PERSON_SEARCH } from '#lib/attendance/person-search.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import { DAILY_SOURCES } from '#lib/schemas/day-results.schema.js';
	import { DAY_STATUSES, type AbsenceType } from '#lib/schemas/enums.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
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
	const statusLabel = (value: string) =>
		value === ALL
			? m.daily_status_all()
			: DAY_STATUS_LABEL[value as keyof typeof DAY_STATUS_LABEL]();
	const sourceLabel = (value: string) =>
		value === ALL
			? m.daily_source_all()
			: DAILY_SOURCE_LABEL[value as keyof typeof DAILY_SOURCE_LABEL]();

	let filter: HTMLFormElement | undefined = $state();
	/** The picked filters; each follows the URL after a navigation. */
	let scope = $derived(scopeValue);
	let status = $derived<string>(page.status ?? ALL);
	let source = $derived<string>(page.source ?? ALL);
	/** The shown range: exactly the picked dates, no limit (PR44); reset from each load. */
	let fromValue = $derived(page.from);
	let toValue = $derived(page.to);

	/** The filters live in the URL (GET form), so the page survives a reload. */
	async function apply() {
		await tick();
		filter?.requestSubmit();
	}

	const shiftsById = $derived(new Map(page.shifts.map((s) => [s.id, s])));

	type Target = { staffId: string; name: string; date: string; state: AbsenceType | null };
	let editing = $state<Target | null>(null);
	let editOpen = $state(false);
	let history = $state<Target | null>(null);
	let historyOpen = $state(false);

	let recomputing = $state(false);
	/** `toastNotice`, with the button's spinner while the recompute runs. */
	const recomputeSubmit: SubmitFunction = async (input) => {
		recomputing = true;
		const after = await toastNotice(input);
		return async (options) => {
			try {
				if (after) await after(options);
			} finally {
				recomputing = false;
			}
		};
	};
</script>

<svelte:head>
	<title>{m.daily_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.daily_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.daily_description()}</p>
	</div>

	<form
		bind:this={filter}
		method="GET"
		class="flex flex-wrap items-end gap-3"
		data-sveltekit-reset="false"
	>
		<div class="flex flex-col gap-2">
			<Label for="daily-from">{m.daily_field_from()}</Label>
			<Input
				id="daily-from"
				type="date"
				name="from"
				bind:value={fromValue}
				onchange={apply}
				class="w-44"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<Label for="daily-to">{m.daily_field_to()}</Label>
			<Input
				id="daily-to"
				type="date"
				name="to"
				bind:value={toValue}
				onchange={apply}
				class="w-44"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<Label for="daily-scope">{m.attendance_field_scope()}</Label>
			<Select.Root type="single" name="scope" bind:value={scope} onValueChange={apply}>
				<Select.Trigger id="daily-scope" class="w-64">{scopeLabel(scope)}</Select.Trigger>
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
			<Label for="daily-search">{m.daily_filter_person()}</Label>
			<!-- Submits on change (Enter or leaving the box), like the other filters. -->
			<InputGroup.Root class="w-56">
				<InputGroup.Addon>
					<MagnifyingGlassIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					id="daily-search"
					type="search"
					name="q"
					value={page.q ?? ''}
					maxlength={MAX_PERSON_SEARCH}
					placeholder={m.daily_search_placeholder()}
					onchange={apply}
				/>
			</InputGroup.Root>
		</div>
		<div class="flex flex-col gap-2">
			<Label for="daily-status">{m.daily_col_status()}</Label>
			<Select.Root type="single" name="status" bind:value={status} onValueChange={apply}>
				<Select.Trigger id="daily-status" class="w-44">{statusLabel(status)}</Select.Trigger>
				<Select.Content>
					<Select.Item value={ALL} label={statusLabel(ALL)} />
					{#each DAY_STATUSES as option (option)}
						<Select.Item value={option} label={statusLabel(option)} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="flex flex-col gap-2">
			<Label for="daily-source">{m.daily_filter_source()}</Label>
			<Select.Root type="single" name="source" bind:value={source} onValueChange={apply}>
				<Select.Trigger id="daily-source" class="w-44">{sourceLabel(source)}</Select.Trigger>
				<Select.Content>
					<Select.Item value={ALL} label={sourceLabel(ALL)} />
					{#each DAILY_SOURCES as option (option)}
						<Select.Item value={option} label={sourceLabel(option)} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<noscript><button type="submit">{m.attendance_show()}</button></noscript>
	</form>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.daily_rows_title({ count: page.rows.length, total: page.total })}</Card.Title>
			<Card.Description>
				{page.missing > 0 ? m.daily_missing({ count: page.missing }) : m.daily_rows_description()}
			</Card.Description>
			{#if data.canRecord}
				<Card.Action>
					<form method="POST" action="?/recomputeDays" use:enhance={recomputeSubmit}>
						<input type="hidden" name="from" value={page.from} />
						<input type="hidden" name="to" value={page.to} />
						<input type="hidden" name="scope" value={scopeValue === ALL ? '' : scopeValue} />
						<input type="hidden" name="q" value={page.q ?? ''} />
						<Button type="submit" variant="outline" size="sm" disabled={recomputing}>
							{#if recomputing}
								<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
							{:else}
								<ArrowsClockwiseIcon data-icon="inline-start" />
							{/if}
							{m.daily_recompute_days()}
						</Button>
					</form>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.attendance_field_date()}</Table.Head>
						<Table.Head>{m.attendance_col_person()}</Table.Head>
						<Table.Head>{m.attendance_col_shift()}</Table.Head>
						<Table.Head>{m.daily_col_status()}</Table.Head>
						<Table.Head>{m.attendance_col_in()}</Table.Head>
						<Table.Head>{m.attendance_col_out()}</Table.Head>
						<Table.Head>{m.daily_col_worked()}</Table.Head>
						<Table.Head>{m.daily_col_late()}</Table.Head>
						<Table.Head>{m.daily_col_overtime()}</Table.Head>
						<Table.Head><span class="sr-only">{m.daily_col_actions()}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each page.rows as row (`${row.person.staffId}:${row.figures.shiftDate}`)}
						{const f = $derived(row.figures)}
						{const name = $derived(personName(row.person))}
						{const shift = $derived(f.shiftId ? (shiftsById.get(f.shiftId) ?? null) : null)}
						<Table.Row class="align-top">
							<Table.Cell class="whitespace-nowrap">
								<bdi>{formatCalendarDate(f.shiftDate)}</bdi>
								<div class="text-xs text-muted-foreground">
									{formatPreviewDay(f.shiftDate).weekday}
								</div>
							</Table.Cell>
							<Table.Cell>
								<!-- Opens the day panel of this date on the employee page. -->
								<Button
									variant="link"
									class="h-auto p-0 font-medium"
									href={`${localizedHref('/employees/[id]', { id: row.person.staffId })}?tab=schedule&from=${f.shiftDate}&day=${f.shiftDate}`}
								>
									{name}
								</Button>
								<div>
									<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
										{row.person.employeeNo}
									</bdi>
								</div>
							</Table.Cell>
							<Table.Cell>
								<ShiftChip {shift} />
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col items-start gap-1">
									<span>{DAY_STATUS_LABEL[f.status]()}</span>
									<DayBadges figures={f} />
									{#if row.needsRecompute}
										<Badge variant="outline">{m.daily_badge_flagged()}</Badge>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								<PunchTime at={f.checkIn} source={f.checkInSource} shiftDate={f.shiftDate} />
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								<PunchTime at={f.checkOut} source={f.checkOutSource} shiftDate={f.shiftDate} />
							</Table.Cell>
							<Table.Cell>
								<bdi class="font-mono" dir="ltr">
									{f.workedMinutes === null ? '—' : formatHoursMinutes(f.workedMinutes)}
								</bdi>
							</Table.Cell>
							<Table.Cell>
								<bdi class="font-mono" dir="ltr">
									{f.lateMinutes > 0 ? formatHoursMinutes(f.lateMinutes) : '—'}
								</bdi>
							</Table.Cell>
							<Table.Cell>
								<OvertimeCell figures={f} />
							</Table.Cell>
							<Table.Cell>
								<div class="flex justify-end gap-1">
									{#if data.dayStateForms}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => {
												editing = {
													staffId: row.person.staffId,
													name,
													date: f.shiftDate,
													state: f.absenceType
												};
												editOpen = true;
											}}
										>
											<PencilSimpleIcon data-icon="inline-start" />
											{m.daily_edit_day()}
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => {
											history = {
												staffId: row.person.staffId,
												name,
												date: f.shiftDate,
												state: f.absenceType
											};
											historyOpen = true;
										}}
									>
										<ClockCounterClockwiseIcon data-icon="inline-start" />
										{m.daily_history()}
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={10} class="h-20 text-center text-muted-foreground">
								{page.total > 0 ? m.daily_none_match() : m.daily_none_stored()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	{#if data.recomputeForm}
		<RecomputeCard data={data.recomputeForm} today={page.today} maxDays={data.maxRecomputeDays} />
	{/if}
</section>

{#if data.dayStateForms}
	<DayStateSheet forms={data.dayStateForms} target={editing} bind:open={editOpen} />
{/if}
<DayHistorySheet target={history} shifts={page.shifts} bind:open={historyOpen} />
