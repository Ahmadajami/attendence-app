<script lang="ts">
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PersonReportNode } from '#lib/server/services/management/management.bl.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import { initials } from '#lib/workforce/profile.js';
	import ReportTree from './ReportTree.svelte';

	type Props = {
		nodes: PersonReportNode[];
		/** `?on=` of the page, kept on the links so a person's tab opens on the same date. */
		date: string;
		today: string;
		/** Nesting level, for the ids of the expandable lists. */
		depth?: number;
	};

	let { nodes, date, today, depth = 0 }: Props = $props();

	/** Opened nodes, by person (the first level shows; deeper levels open on demand, M18). */
	let opened = $state<Record<string, boolean>>({});

	function profileHref(staffId: string): string {
		const base = localizedHref('/employees/[id]', { id: staffId });
		return date === today ? `${base}?tab=management` : `${base}?tab=management&on=${date}`;
	}
</script>

<!-- Nested lists with disclosure buttons (`aria-expanded`), not an ARIA tree widget. -->
<ul class="flex flex-col gap-1">
	{#each nodes as node (node.person.staffId)}
		{const listId = $derived(`report-tree-${depth}-${node.person.staffId}`)}
		<li class="flex flex-col gap-1">
			<div class="flex flex-wrap items-center gap-2 text-sm">
				{#if node.kind === 'person'}
					<span class="size-7 shrink-0" aria-hidden="true"></span>
				{:else}
					<Button
						variant="ghost"
						size="icon"
						class="size-7"
						aria-expanded={opened[node.person.staffId] ?? false}
						aria-controls={listId}
						aria-label={opened[node.person.staffId]
							? m.management_tree_collapse({ name: personName(node.person) })
							: m.management_tree_expand({ name: personName(node.person) })}
						onclick={() =>
							(opened = { ...opened, [node.person.staffId]: !opened[node.person.staffId] })}
					>
						<!-- Closed: points to the inline end (flipped in RTL); open: points down. -->
						<CaretRightIcon
							class={[
								'transition-transform',
								opened[node.person.staffId] ? 'rotate-90' : 'rtl:rotate-180'
							]}
						/>
					</Button>
				{/if}
				<Avatar.Root class="size-7">
					<Avatar.Fallback class="text-xs font-medium">
						{initials(personName(node.person))}
					</Avatar.Fallback>
				</Avatar.Root>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() resolves; only `?tab=` / `&on=` are added -->
				<a href={profileHref(node.person.staffId)} class="font-medium hover:underline">
					{personName(node.person)}
				</a>
				{#if node.kind === 'manager'}
					<Badge variant="secondary">
						{m.management_tree_role_manager({
							units: node.units.map((u) => lookupName(u)).join(m.list_separator())
						})}
					</Badge>
				{:else if node.kind === 'supervisor'}
					<Badge variant="outline">
						{m.management_tree_role_supervisor({
							units: node.units.map((u) => lookupName(u)).join(m.list_separator())
						})}
					</Badge>
				{:else if node.kind === 'person' && node.team}
					<span class="text-xs text-muted-foreground">{lookupName(node.team)}</span>
				{/if}
				{#if node.kind !== 'person'}
					<span class="text-xs text-muted-foreground">
						{m.management_people_count({ count: node.count })}
					</span>
				{/if}
			</div>
			{#if node.kind !== 'person'}
				<!-- Always present for `aria-controls`; the level below renders only once opened. -->
				<div id={listId} class="ps-9" hidden={!opened[node.person.staffId]}>
					{#if opened[node.person.staffId]}
						{#if node.children.length > 0}
							<ReportTree nodes={node.children} {date} {today} depth={depth + 1} />
						{:else}
							<p class="text-xs text-muted-foreground">{m.management_tree_nobody()}</p>
						{/if}
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>
