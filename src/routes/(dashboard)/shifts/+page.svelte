<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { enhance, type SubmitFunction } from '$app/forms';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import LockSimpleIcon from 'phosphor-svelte/lib/LockSimpleIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
	import { formatDuration } from '#lib/app/shifts/labels.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { endsNextDay, graceOf, isNightShift, requiredOf, spanOf } from '#lib/roster/shift.js';
	import { lookupName } from '#lib/utils/locale.js';
	import ShiftFormSheet from './ShiftFormSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Shift = (typeof data.shifts)[number];

	let formOpen = $state(false);
	let target = $state<Shift | null>(null);

	function openCreate() {
		target = null;
		formOpen = true;
	}

	function openEdit(row: Shift) {
		target = row;
		formOpen = true;
	}

	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ shiftId: '', active: 'false' });

	async function setActive(row: Shift, active: boolean) {
		activeRequest = { shiftId: row.id, active: String(active) };
		await tick();
		activeForm?.requestSubmit();
	}

	const toastNotice: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' || result.type === 'failure') {
				const notice = result.data?.notice;
				if (typeof notice === 'string') {
					if (result.type === 'success') toast.success(notice);
					else toast.error(notice);
				}
			}
			await update();
		};
	};

	const clock = (time: string) => time.slice(0, 5);
</script>

<svelte:head>
	<title>{m.shifts_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.shifts_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.shifts_description()}</p>
		</div>
		{#if data.canManage}
			<Button onclick={openCreate}>
				<PlusIcon data-icon="inline-start" />
				{m.shifts_new()}
			</Button>
		{/if}
	</div>

	<Card.Root>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.shifts_col_shift()}</Table.Head>
						<Table.Head>{m.shifts_col_times()}</Table.Head>
						<Table.Head>{m.shifts_col_span()}</Table.Head>
						<Table.Head>{m.shifts_col_required()}</Table.Head>
						<Table.Head>{m.shifts_col_break()}</Table.Head>
						<Table.Head>{m.shifts_col_grace()}</Table.Head>
						<Table.Head>{m.shifts_col_used_by()}</Table.Head>
						<Table.Head>{m.shifts_col_status()}</Table.Head>
						{#if data.canManage}
							<Table.Head>
								<span class="sr-only">{m.shifts_actions({ name: '' })}</span>
							</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.shifts as row (row.id)}
						<Table.Row class={row.active ? undefined : 'text-muted-foreground'}>
							<Table.Cell>
								<span class="inline-flex items-center gap-2 font-medium">
									<ShiftChip shift={row} />
									{lookupName(row)}
									{#if isNightShift(row)}
										<span title={m.shifts_hint_night()}>🌙</span>
									{/if}
								</span>
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								<bdi dir="ltr">{clock(row.startTime)} → {clock(row.endTime)}</bdi>
								{#if endsNextDay(row)}
									<Badge variant="outline" class="ms-2">{m.shifts_hint_next_day()}</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">{formatDuration(spanOf(row))}</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{m.shifts_minutes({ count: requiredOf(row) })}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{m.shifts_minutes({ count: row.breakMinutes })}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{row.graceMinutes > 0
									? m.shifts_minutes({ count: row.graceMinutes })
									: m.shifts_grace_default({ minutes: graceOf(row) })}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								<span class="inline-flex items-center gap-1.5">
									{m.shifts_used_by({ count: row.patternCount })}
									{#if row.used}
										<LockSimpleIcon class="size-4 text-muted-foreground" />
										<span class="sr-only">{m.shifts_locked()}</span>
									{/if}
								</span>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={row.active ? 'secondary' : 'outline'}>
									{row.active ? m.shifts_status_active() : m.shifts_status_inactive()}
								</Badge>
							</Table.Cell>
							{#if data.canManage}
								<Table.Cell class="text-end">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon"
													aria-label={m.shifts_actions({ name: lookupName(row) })}
												>
													<DotsThreeIcon />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onSelect={() => openEdit(row)}>
												<PencilSimpleIcon />
												{m.shifts_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											{#if row.active}
												<DropdownMenu.Item
													variant="destructive"
													onSelect={() => setActive(row, false)}
												>
													<ProhibitIcon />
													{m.shifts_deactivate()}
												</DropdownMenu.Item>
											{:else}
												<DropdownMenu.Item onSelect={() => setActive(row, true)}>
													<CheckCircleIcon />
													{m.shifts_activate()}
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							{/if}
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={9} class="h-20 text-center text-muted-foreground">
								{m.shifts_empty()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>

{#if data.canManage}
	<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
		<input type="hidden" name="shiftId" value={activeRequest.shiftId} />
		<input type="hidden" name="active" value={activeRequest.active} />
	</form>

	<ShiftFormSheet data={data.form} {target} bind:open={formOpen} />
{/if}
