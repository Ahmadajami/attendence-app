<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PatternRow } from '#lib/server/services/roster/roster.crud.js';
	import { formatCalendarDate, formatWallClock, shiftKindLetter } from './labels.js';

	type Version = PatternRow;

	type Props = { versions: Version[]; today: string };

	let { versions, today }: Props = $props();

	const newestFirst = $derived([...versions].reverse());

	function versionState(v: Version): 'current' | 'scheduled' | 'past' {
		if (v.effectiveFrom > today) return 'scheduled';
		if (v.effectiveTo !== null && v.effectiveTo <= today) return 'past';
		return 'current';
	}
</script>

{#if versions.length === 0}
	<p class="text-sm text-muted-foreground">{m.roster_history_empty()}</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>{m.roster_history_from()}</Table.Head>
				<Table.Head>{m.roster_history_to()}</Table.Head>
				<Table.Head>{m.roster_field_cycle()}</Table.Head>
				<Table.Head>{m.roster_history_times()}</Table.Head>
				<Table.Head>{m.roster_field_reason()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each newestFirst as version (version.id)}
				{const status = versionState(version)}
				<Table.Row class={status === 'past' ? 'text-muted-foreground' : undefined}>
					<Table.Cell class="whitespace-nowrap">
						<bdi>{formatCalendarDate(version.effectiveFrom)}</bdi>
						{#if status === 'current'}
							<Badge variant="secondary" class="ms-2">{m.roster_history_current()}</Badge>
						{:else if status === 'scheduled'}
							<Badge variant="outline" class="ms-2">{m.roster_history_scheduled()}</Badge>
						{/if}
					</Table.Cell>
					<Table.Cell class="whitespace-nowrap">
						{#if version.effectiveTo}
							<bdi>{formatCalendarDate(version.effectiveTo)}</bdi>
						{:else}
							{m.roster_history_open()}
						{/if}
					</Table.Cell>
					<Table.Cell>
						<bdi class="font-mono text-xs" dir="ltr">
							{version.cycle.map(shiftKindLetter).join(' ')}
						</bdi>
						<span class="block text-xs text-muted-foreground">
							{m.roster_history_anchor({ date: formatCalendarDate(version.anchorDate) })}
						</span>
					</Table.Cell>
					<Table.Cell class="whitespace-nowrap">
						<bdi dir="ltr"
							>{formatWallClock(version.dayStart)} / {formatWallClock(version.nightStart)}</bdi
						>
					</Table.Cell>
					<Table.Cell class="max-w-64 truncate" title={version.reason}>{version.reason}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
