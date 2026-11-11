<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page as current } from '$app/state';
	import ArrowsLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRightIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { formatCalendarDate, formatPreviewDay } from '#lib/app/roster/labels.js';
	import PersonPicker from '#lib/app/swaps/PersonPicker.svelte';
	import SwapDetailSheet from '#lib/app/swaps/SwapDetailSheet.svelte';
	import SwapStateBadge from '#lib/app/swaps/SwapStateBadge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as UnderlineTabs from '#lib/components/ui/underline-tabs/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { SWAP_KIND_LABEL } from '#lib/roster/swap-labels.js';
	import type { SwapTab } from '#lib/server/services/swaps/swaps.bl.js';
	import { formatDateTime } from '#lib/utils/datetime.js';
	import { personName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const shifts = $derived(new Map(data.shifts.map((s) => [s.id, s])));

	const TAB_LABEL: Record<SwapTab, (count: { count: number }) => string> = {
		pending: m.swaps_tab_pending,
		approved: m.swaps_tab_approved,
		closed: m.swaps_tab_closed
	};

	/** The URL with these search params changed (`null` removes one). */
	function withParams(changes: Record<string, string | null>): URL {
		const url = new URL(current.url.href);
		for (const [key, value] of Object.entries(changes))
			if (value === null) url.searchParams.delete(key);
			else url.searchParams.set(key, value);
		return url;
	}

	function navigate(changes: Record<string, string | null>, replace = false) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only the search params change
		void goto(withParams(changes), { replace, reset: false });
	}

	let filter: HTMLFormElement | undefined = $state();
	/** The picked filters; each follows the URL after a navigation. */
	let month = $derived(data.month);
	let staff = $derived(data.staffId ?? '');

	/** The filters live in the URL (GET form), so the page survives a reload. */
	async function apply() {
		await tick();
		filter?.requestSubmit();
	}

	/** New swap, with the filtered person as A. */
	const newHref = $derived(
		`${localizedHref('/changes/new')}${data.staffId ? `?staff=${data.staffId}` : ''}`
	);

	const detailOpen = $derived(data.swapId !== null);
	const openSwap = (id: string) => navigate({ swap: id });
	const closeSwap = () => navigate({ swap: null }, true);

	/** A request's two dates with what each one is (SW1). */
	function datesOf(row: (typeof data.rows)[number]) {
		if (row.kind === 'shift_change')
			return [{ label: m.swap_date_shift_change(), date: row.firstDate }];
		const self = row.kind === 'self_swap';
		return [
			{ label: self ? m.swap_date_self_first() : m.swap_date_emp_first(), date: row.firstDate },
			...(row.secondDate
				? [
						{
							label: self ? m.swap_date_self_second() : m.swap_date_emp_second(),
							date: row.secondDate
						}
					]
				: [])
		];
	}
</script>

<svelte:head>
	<title>{m.swaps_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.swaps_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.swaps_description()}</p>
		</div>
		<Button href={newHref}>
			<PlusIcon data-icon="inline-start" />
			{m.swaps_new()}
		</Button>
	</div>

	<form
		bind:this={filter}
		method="GET"
		class="flex flex-wrap items-end gap-3"
		data-sveltekit-reset="false"
	>
		<input type="hidden" name="state" value={data.tab} />
		<div class="flex flex-col gap-2">
			<Label for="swaps-month">{m.swaps_field_month()}</Label>
			<Input
				id="swaps-month"
				type="month"
				name="month"
				bind:value={month}
				onchange={apply}
				class="w-44"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<Label for="swaps-person">{m.swaps_filter_person()}</Label>
			<!-- Submits on a pick or a clear, like the other filters. -->
			<PersonPicker
				id="swaps-person"
				name="staff"
				class="w-64"
				clearable
				placeholder={m.daily_scope_everyone()}
				bind:value={staff}
				person={data.person}
				onchange={apply}
			/>
		</div>
		<noscript><button type="submit">{m.attendance_show()}</button></noscript>
	</form>

	<UnderlineTabs.Root bind:value={() => data.tab, (tab) => navigate({ state: tab, swap: null })}>
		<UnderlineTabs.List class="max-w-full overflow-x-auto">
			{#each ['pending', 'approved', 'closed'] as const as tab (tab)}
				<UnderlineTabs.Trigger value={tab}>
					{TAB_LABEL[tab]({ count: data.counts[tab] })}
				</UnderlineTabs.Trigger>
			{/each}
		</UnderlineTabs.List>
	</UnderlineTabs.Root>

	<Card.Root>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.swaps_col_kind()}</Table.Head>
						<Table.Head>{m.swaps_col_people()}</Table.Head>
						<Table.Head>{m.swaps_col_dates()}</Table.Head>
						<Table.Head>{m.swaps_col_requested()}</Table.Head>
						<Table.Head>{m.swaps_col_state()}</Table.Head>
						<Table.Head><span class="sr-only">{m.daily_col_actions()}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.rows as row (row.id)}
						<Table.Row class="align-top">
							<Table.Cell>
								{SWAP_KIND_LABEL[row.kind]()}
								{#if row.payAsOt}
									<div class="text-xs text-muted-foreground">{m.swaps_pay_as_ot()}</div>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col gap-1">
									<span>
										{personName(row.a)}
										<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
											{row.a.employeeNo}
										</bdi>
									</span>
									{#if row.b}
										<span class="flex items-center gap-1">
											<ArrowsLeftRightIcon class="size-3 text-muted-foreground" />
											{personName(row.b)}
											<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
												{row.b.employeeNo}
											</bdi>
										</span>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell>
								<dl class="grid grid-cols-[auto_auto] gap-x-2 text-sm">
									{#each datesOf(row) as item (item.date)}
										<dt class="text-muted-foreground">{item.label}</dt>
										<dd class="whitespace-nowrap">
											<bdi>{formatCalendarDate(item.date)}</bdi>
											<span class="text-xs text-muted-foreground">
												{formatPreviewDay(item.date).weekday}
											</span>
										</dd>
									{/each}
								</dl>
							</Table.Cell>
							<Table.Cell class="text-sm">
								<div>{row.requestedBy ? personName(row.requestedBy) : m.swap_someone()}</div>
								<bdi class="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</bdi>
							</Table.Cell>
							<Table.Cell>
								<SwapStateBadge state={row.state} />
							</Table.Cell>
							<Table.Cell>
								<div class="flex justify-end">
									<Button variant="ghost" size="sm" onclick={() => openSwap(row.id)}>
										{m.swaps_open()}
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="h-20 text-center text-muted-foreground">
								{m.swaps_none()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>

<SwapDetailSheet
	bind:open={() => detailOpen, (open) => !open && closeSwap()}
	detail={data.detail}
	missing={data.swapId !== null && data.detail === null}
	{shifts}
	canManage={data.canApprove}
/>
