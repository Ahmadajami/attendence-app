<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import FilesIcon from 'phosphor-svelte/lib/FilesIcon';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { getStaffLists } from '#lib/app/staff-lists/context.js';
	import { manageLabel, newItemLabel } from '#lib/app/staff-lists/labels.js';
	import Empty from '#lib/app/state/Empty.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { documentFormSchema, ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileDocument } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import { lookupName } from '#lib/utils/locale.js';
	import DocumentForm from './DocumentForm.svelte';
	import FormSheet from './FormSheet.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof documentFormSchema>, ProfileMessage>;
		documents: ProfileDocument[];
		summary: { required: number; received: number };
		today: string;
		/** The person's name, for the sheet's description. */
		name: string;
	};

	let { data, documents, summary, today, name }: Props = $props();

	const lists = getStaffLists();
	let open = $state(false);
	let editingTypeId = $state<string | null>(null);
	/** Follows the reloaded list, so the form shows the saved state. */
	const editing = $derived(documents.find((d) => d.type.id === editingTypeId) ?? null);

	function openForm(doc: ProfileDocument) {
		editingTypeId = doc.type.id;
		open = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.profile_documents_title()}</Card.Title>
		<Card.Description>
			{m.profile_documents_received_of({ received: summary.received, required: summary.required })}
		</Card.Description>
		<Card.Action class="flex flex-wrap justify-end gap-2">
			<Button variant="ghost" size="sm" onclick={() => lists.manage('document_type')}>
				<ListChecksIcon data-icon="inline-start" />
				{manageLabel('document_type')}
			</Button>
			<Button variant="outline" size="sm" onclick={() => lists.create('document_type')}>
				<PlusIcon data-icon="inline-start" />
				{newItemLabel('document_type')}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if documents.length === 0}
			<Empty icon={FilesIcon} title={m.profile_documents_empty()} />
		{:else}
			<ul class="flex flex-col gap-3">
				{#each documents as doc (doc.type.id)}
					<li class="flex items-start justify-between gap-2 text-sm">
						<div class="flex flex-col gap-0.5">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{lookupName(doc.type)}</span>
								{#if doc.type.required}
									<Badge variant="outline">{m.profile_document_required()}</Badge>
								{/if}
								{#if !doc.type.active}
									<Badge variant="outline">{m.staff_lists_status_inactive()}</Badge>
								{/if}
							</div>
							{#if doc.record?.received && doc.record.receivedOn}
								<span>
									{m.profile_document_received_on()}
									<bdi>{formatDate(doc.record.receivedOn)}</bdi>
								</span>
							{:else}
								<span class={doc.type.required ? 'text-destructive' : 'text-muted-foreground'}>
									{m.profile_document_not_received()}
								</span>
							{/if}
							{#if doc.record?.referenceNo}
								<span class="text-muted-foreground">
									{m.profile_field_reference_no()}:
									<bdi dir="ltr">{doc.record.referenceNo}</bdi>
								</span>
							{/if}
							{#if doc.record?.expiresOn}
								<span
									class={doc.record.expiresOn < today
										? 'text-destructive'
										: 'text-muted-foreground'}
								>
									{m.profile_field_expires_on()}:
									<bdi>{formatDate(doc.record.expiresOn)}</bdi>
								</span>
							{/if}
						</div>
						<Button
							variant="ghost"
							size="icon"
							aria-label={m.profile_edit_item({ name: lookupName(doc.type) })}
							onclick={() => openForm(doc)}
						>
							<PencilSimpleIcon />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

<FormSheet
	title={editing ? m.profile_document_edit({ name: lookupName(editing.type) }) : ''}
	description={name}
	bind:open
>
	{#if editing}
		<DocumentForm {data} document={editing} {today} onDone={() => (open = false)} />
	{/if}
</FormSheet>
