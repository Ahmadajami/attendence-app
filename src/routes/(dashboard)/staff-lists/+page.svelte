<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffListKind } from '#lib/schemas/staff-lists.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import { kindTitle } from './labels.js';
	import StaffListFormSheet from './StaffListFormSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let formOpen = $state(false);
	let formKind = $state<StaffListKind>('job_title');
	let target = $state<StaffListOption | null>(null);

	function openForm(kind: StaffListKind, item: StaffListOption | null) {
		formKind = kind;
		target = item;
		formOpen = true;
	}

	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ kind: 'job_title', itemId: '', active: 'false' });

	async function setActive(kind: StaffListKind, item: StaffListOption, active: boolean) {
		activeRequest = { kind, itemId: item.id, active: String(active) };
		await tick();
		activeForm?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{m.staff_lists_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.staff_lists_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.staff_lists_description()}</p>
	</div>

	{@render listCard('job_title', data.jobTitles)}
	{@render listCard('skill', data.skills)}
	{@render listCard('document_type', data.documentTypes)}
	{@render listCard('custody_item_type', data.custodyItemTypes)}
</section>

{#snippet listCard(kind: StaffListKind, items: StaffListOption[])}
	<Card.Root>
		<Card.Header class="flex flex-row flex-wrap items-center justify-between gap-2">
			<Card.Title>{kindTitle(kind)}</Card.Title>
			<Button size="sm" variant="outline" onclick={() => openForm(kind, null)}>
				<PlusIcon data-icon="inline-start" />
				{m.staff_lists_new()}
			</Button>
		</Card.Header>
		<Card.Content class="px-0">
			{#if items.length === 0}
				<Empty icon={ListChecksIcon} title={m.staff_lists_empty()} />
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.staff_lists_col_name()}</Table.Head>
							{#if kind === 'document_type'}
								<Table.Head>{m.staff_lists_field_required()}</Table.Head>
							{/if}
							<Table.Head>{m.staff_lists_col_status()}</Table.Head>
							<Table.Head>
								<span class="sr-only">{m.staff_lists_actions({ name: '' })}</span>
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each items as item (item.id)}
							<Table.Row>
								<Table.Cell class="font-medium">{lookupName(item)}</Table.Cell>
								{#if kind === 'document_type'}
									<Table.Cell>
										{item.required ? m.staff_lists_required_yes() : m.staff_lists_required_no()}
									</Table.Cell>
								{/if}
								<Table.Cell>
									<Badge variant={item.active ? 'secondary' : 'outline'}>
										{item.active ? m.staff_lists_status_active() : m.staff_lists_status_inactive()}
									</Badge>
								</Table.Cell>
								<Table.Cell class="text-end">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon"
													aria-label={m.staff_lists_actions({ name: lookupName(item) })}
												>
													<DotsThreeIcon />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onSelect={() => openForm(kind, item)}>
												<PencilSimpleIcon />
												{m.staff_lists_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											{#if item.active}
												<DropdownMenu.Item
													variant="destructive"
													onSelect={() => setActive(kind, item, false)}
												>
													<ProhibitIcon />
													{m.staff_lists_deactivate()}
												</DropdownMenu.Item>
											{:else}
												<DropdownMenu.Item onSelect={() => setActive(kind, item, true)}>
													<CheckCircleIcon />
													{m.staff_lists_activate()}
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
{/snippet}

<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
	<input type="hidden" name="kind" value={activeRequest.kind} />
	<input type="hidden" name="itemId" value={activeRequest.itemId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>

<StaffListFormSheet data={data.form} kind={formKind} {target} bind:open={formOpen} />
