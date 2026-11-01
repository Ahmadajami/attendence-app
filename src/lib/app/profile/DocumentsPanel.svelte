<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { documentFormSchema, ProfileMessage } from '#lib/schemas/staff-profile.schema.js';
	import type { ProfileDocument } from '#lib/types/profile.js';
	import { formatDate } from '#lib/utils/datetime.js';
	import { lookupName } from '#lib/utils/locale.js';
	import DocumentForm from './DocumentForm.svelte';

	type Props = {
		data: SuperValidated<Infer<typeof documentFormSchema>, ProfileMessage>;
		documents: ProfileDocument[];
		summary: { required: number; received: number };
		today: string;
	};

	let { data, documents, summary, today }: Props = $props();

	let editingTypeId = $state<string | null>(null);
	/** Follows the reloaded list, so the form shows the saved state. */
	const editing = $derived(documents.find((d) => d.type.id === editingTypeId) ?? null);
</script>

<div class="grid gap-8 lg:grid-cols-2">
	<div class="flex flex-col gap-2">
		<p class="text-sm text-muted-foreground">
			{m.profile_documents_received_of({ received: summary.received, required: summary.required })}
		</p>
		{#if documents.length === 0}
			<p class="text-sm text-muted-foreground">{m.profile_documents_empty()}</p>
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
							onclick={() => (editingTypeId = doc.type.id)}
						>
							<PencilSimpleIcon />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if editing}
		{#key editing.type.id}
			<DocumentForm {data} document={editing} {today} onDone={() => (editingTypeId = null)} />
		{/key}
	{/if}
</div>
