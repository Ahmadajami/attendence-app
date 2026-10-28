<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterDay } from '#lib/roster/roster.js';
	import { cn } from '#lib/utils.js';
	import { formatPreviewDay, shiftKindLabel, shiftKindLetter } from './labels.js';
	import type { PreviewRow } from './preview.js';

	type Props = {
		rows: PreviewRow[];
		today: string;
		/** On a team page: days on which the person was in another team (or none) are greyed out. */
		teamId?: string;
	};

	let { rows, today, teamId }: Props = $props();

	const dates = $derived(rows[0]?.days.map((d) => d.date) ?? []);

	function cellClass(day: RosterDay): string {
		if (teamId !== undefined && day.teamId !== teamId) return 'text-muted-foreground/40';
		if (day.source === 'absence') return 'bg-destructive/10 text-destructive';
		if (day.kind === 'day') return 'bg-primary/15 text-primary';
		if (day.kind === 'night') return 'bg-foreground text-background';
		return 'text-muted-foreground';
	}

	function cellTitle(day: RosterDay): string {
		if (teamId !== undefined && day.teamId !== teamId) return m.roster_preview_other_team();
		if (day.source === 'absence') return m.roster_preview_absent();
		const kind = shiftKindLabel(day.kind);
		if (day.extra) return m.roster_preview_extra({ kind });
		if (day.source === 'override') return m.roster_preview_override({ kind });
		return kind;
	}
</script>

{#if rows.length === 0}
	<p class="text-sm text-muted-foreground">{m.roster_preview_empty()}</p>
{:else}
	<div class="flex flex-col gap-3">
		<div class="overflow-x-auto">
			<table class="w-full border-separate border-spacing-0.5 text-xs">
				<thead>
					<tr>
						<th scope="col" class="sticky start-0 bg-card pe-2 text-start font-medium">
							<span class="sr-only">{m.roster_preview_person()}</span>
						</th>
						{#each dates as date (date)}
							{const label = formatPreviewDay(date)}
							<th
								scope="col"
								class={cn(
									'min-w-7 px-0.5 text-center font-normal text-muted-foreground',
									date === today && 'font-semibold text-foreground'
								)}
							>
								<span class="block">{label.weekday}</span>
								<span class="block">{label.day}</span>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr>
							<th
								scope="row"
								class="sticky start-0 max-w-40 truncate bg-card pe-2 text-start text-sm font-medium"
							>
								{#if row.href}
									<a href={row.href} class="hover:underline">{row.label}</a>
								{:else}
									{row.label}
								{/if}
							</th>
							{#each row.days as day (day.date)}
								<td
									class={cn('h-7 rounded-sm text-center font-semibold', cellClass(day))}
									title={cellTitle(day)}
								>
									<span aria-hidden="true">
										{teamId !== undefined && day.teamId !== teamId
											? '·'
											: day.source === 'absence'
												? m.roster_letter_absent()
												: shiftKindLetter(day.kind)}{day.extra || day.source === 'override'
											? '*'
											: ''}
									</span>
									<span class="sr-only">{cellTitle(day)}</span>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="text-xs text-muted-foreground">{m.roster_preview_legend()}</p>
	</div>
{/if}
