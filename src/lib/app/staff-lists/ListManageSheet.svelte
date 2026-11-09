<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffListKind } from '#lib/schemas/staff-lists.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import { endSide, lookupName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import { manageLabel, newItemLabel } from './labels.js';

	type Props = {
		kind: StaffListKind;
		/** The whole list, active and inactive. */
		items: StaffListOption[];
		open: boolean;
		/** Open the create / rename sheet (`null` creates). */
		onEdit: (item: StaffListOption | null) => void;
	};

	let { kind, items, open = $bindable(), onEdit }: Props = $props();

	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ itemId: '', active: 'false' });

	async function setActive(item: StaffListOption, active: boolean) {
		activeRequest = { itemId: item.id, active: String(active) };
		await tick();
		activeForm?.requestSubmit();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>{manageLabel(kind)}</Sheet.Title>
			<Sheet.Description>{m.staff_lists_manage_description()}</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-col gap-4 px-4 pb-4">
			<div class="flex flex-wrap items-center gap-2">
				<Button variant="outline" size="sm" onclick={() => onEdit(null)}>
					<PlusIcon data-icon="inline-start" />
					{newItemLabel(kind)}
				</Button>
				{#if kind === 'job_title'}
					<!-- The full list with who holds each job (jobs plan JB8). -->
					<Button variant="link" size="sm" href={localizedHref('/jobs')}>
						{m.jobs_open_page()}
					</Button>
				{/if}
			</div>

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
								<Table.Cell class="font-medium whitespace-normal">{lookupName(item)}</Table.Cell>
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
											<DropdownMenu.Item onSelect={() => onEdit(item)}>
												<PencilSimpleIcon />
												{m.staff_lists_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											{#if item.active}
												<DropdownMenu.Item
													variant="destructive"
													onSelect={() => setActive(item, false)}
												>
													<ProhibitIcon />
													{m.staff_lists_deactivate()}
												</DropdownMenu.Item>
											{:else}
												<DropdownMenu.Item onSelect={() => setActive(item, true)}>
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
		</div>
	</Sheet.Content>
</Sheet.Root>

<form
	bind:this={activeForm}
	method="POST"
	action="?/setListItemActive"
	use:enhance={toastNotice}
	hidden
>
	<input type="hidden" name="kind" value={kind} />
	<input type="hidden" name="itemId" value={activeRequest.itemId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>
