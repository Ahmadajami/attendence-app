<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { Badge, type BadgeVariant } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { custodyFormSchema, ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileCustodyItem, StaffListOption } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import { lookupName } from '#lib/utils/locale.js';
	import CustodyForm from './CustodyForm.svelte';
	import { custodyStatusLabel } from './labels.js';
	import RemoveItemButton from './RemoveItemButton.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof custodyFormSchema>, ProfileMessage>;
		items: ProfileCustodyItem[];
		types: StaffListOption[];
		today: string;
	};

	let { data, items, types, today }: Props = $props();

	let editing = $state<ProfileCustodyItem | null>(null);

	const STATUS_VARIANT: Record<string, BadgeVariant> = {
		with_employee: 'secondary',
		returned: 'outline',
		lost: 'destructive',
		damaged: 'destructive'
	};
</script>

<div class="grid gap-8 lg:grid-cols-2">
	{#if items.length === 0}
		<p class="text-sm text-muted-foreground">{m.profile_custody_empty()}</p>
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
							onclick={() => (editing = item)}
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

	<CustodyForm {data} {types} {editing} {today} onDone={() => (editing = null)} />
</div>
