<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatDateTime } from '#lib/utils/datetime.js';
	import { personName } from '#lib/utils/locale.js';
	import { kindLabel, statusLabel } from '../labels.js';

	type Person = { fullName: string; fullNameAr: string | null } | null;

	let {
		batch,
		children
	}: {
		batch: {
			fileName: string;
			kind: 'staff' | 'punches' | 'shifts' | 'roster';
			status: 'previewed' | 'committed' | 'failed' | 'undone';
			createdAt: Date;
			createdByUser: Person;
			undoneAt?: Date | null;
			undoneByUser?: Person;
		};
		children?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-start justify-between gap-4">
	<div class="flex items-start gap-3">
		<Button
			variant="ghost"
			size="icon"
			href={localizedHref('/imports')}
			aria-label={m.imports_back()}
		>
			<ArrowLeftIcon class="rtl:rotate-180" />
		</Button>
		<div class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-2xl font-semibold tracking-tight" dir="ltr">{batch.fileName}</h2>
				<Badge variant={batch.status === 'committed' ? 'secondary' : 'outline'}>
					{statusLabel(batch.status)}
				</Badge>
			</div>
			<p class="text-muted-foreground">
				{kindLabel(batch.kind)} · <bdi>{formatDateTime(batch.createdAt)}</bdi> · {batch.createdByUser
					? personName(batch.createdByUser)
					: '—'}
			</p>
			{#if batch.undoneAt}
				<p class="text-sm text-muted-foreground">
					{m.imports_undone_by({
						at: formatDateTime(batch.undoneAt),
						name: batch.undoneByUser ? personName(batch.undoneByUser) : '—'
					})}
				</p>
			{/if}
		</div>
	</div>
	{@render children?.()}
</div>
