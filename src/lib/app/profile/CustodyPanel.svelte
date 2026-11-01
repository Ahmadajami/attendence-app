<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import DeviceMobileIcon from 'phosphor-svelte/lib/DeviceMobileIcon';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { getStaffLists } from '#lib/app/staff-lists/context.js';
	import { manageLabel } from '#lib/app/staff-lists/labels.js';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Badge, type BadgeVariant } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { custodyFormSchema, ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileCustodyItem, StaffListOption } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import { lookupName } from '#lib/utils/locale.js';
	import CustodyForm from './CustodyForm.svelte';
	import FormSheet from './FormSheet.svelte';
	import { custodyStatusLabel } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof custodyFormSchema>, ProfileMessage>;
		items: ProfileCustodyItem[];
		/** The whole custody item list, active and inactive. */
		types: StaffListOption[];
		today: string;
		/** The person's name, for the sheet's description. */
		name: string;
	};

	let { data, items, types, today, name }: Props = $props();

	const lists = getStaffLists();
	let open = $state(false);
	let editing = $state<ProfileCustodyItem | null>(null);

	const STATUS_VARIANT: Record<string, BadgeVariant> = {
		with_employee: 'secondary',
		returned: 'outline',
		lost: 'destructive',
		damaged: 'destructive'
	};

	function openForm(item: ProfileCustodyItem | null) {
		editing = item;
		open = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_custody_title()}</Card.Title>
		<Card.Action class="flex flex-wrap justify-end gap-2">
			<Button variant="ghost" size="sm" onclick={() => lists.manage('custody_item_type')}>
				<ListChecksIcon data-icon="inline-start" />
				{manageLabel('custody_item_type')}
			</Button>
			<Button variant="outline" size="sm" onclick={() => openForm(null)}>
				<PlusIcon data-icon="inline-start" />
				{m.profile_custody_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if items.length === 0}
			<Empty icon={DeviceMobileIcon} title={m.profile_custody_empty()} />
		{:else}
			<ul class="flex flex-col gap-3">
				{#each items as item (item.id)}
					<li class="flex items-start justify-between gap-2 text-sm">
						<div class="flex flex-col gap-0.5">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{lookupName(item)}</span>
								<Badge variant={STATUS_VARIANT[item.status] ?? 'outline'}>
									{custodyStatusLabel(item.status)}
								</Badge>
							</div>
							{#if item.identifier}
								<bdi dir="ltr" class="text-muted-foreground">{item.identifier}</bdi>
							{/if}
							<span class="text-muted-foreground">
								{m.profile_custody_issued_on()}
								<bdi>{formatDate(item.issuedOn)}</bdi>
								{#if item.statusOn}
									· {custodyStatusLabel(item.status)}
									<bdi>{formatDate(item.statusOn)}</bdi>
								{/if}
							</span>
							{#if item.note}
								<span class="text-muted-foreground">{item.note}</span>
							{/if}
						</div>
						<div class="flex">
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.profile_edit_item({ name: lookupName(item) })}
								onclick={() => openForm(item)}
							>
								<PencilSimpleIcon />
							</Button>
							<RemoveItemButton
								kind="custody"
								itemId={item.id}
								label={m.profile_remove_item({ name: lookupName(item) })}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

<FormSheet
	title={editing ? m.profile_custody_edit() : m.profile_custody_add()}
	description={name}
	bind:open
>
	<CustodyForm {data} {types} {editing} {today} onDone={() => (open = false)} />
</FormSheet>
