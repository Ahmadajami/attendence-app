<script lang="ts">
	import { dayTagClass } from '#lib/app/attendance/day-tag-tones.js';
	import { STATE_TAG } from '#lib/attendance/day-tags.js';
	import type { PunchDays } from '#lib/attendance/entry.js';
	import { absenceLabel } from '#lib/attendance/labels.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import type { RosterDay } from '#lib/roster/roster.js';
	import { isNightShift } from '#lib/roster/shift.js';
	import { cn } from '#lib/utils.js';
	import { shiftColourClass } from './colours.js';
	import { formatPreviewDay, slotLabel } from './labels.js';
	import type { PreviewRow } from './preview.js';

	type Props = {
		rows: PreviewRow[];
		today: string;
		/** On a team page: days on which the person was in another team (or none) are greyed out. */
		teamId?: string;
		/** Punches per person and shift date: a dot and the worked time under the code. */
		punches?: PunchDays;
		/** Makes each day a button (the employee page's day panel). */
		onSelectDay?: (date: string) => void;
		selectedDay?: string | null;
		/** More days to ring (the New swap page's two dates). */
		selectedDays?: readonly string[];
	};

	let {
		rows,
		today,
		teamId,
		punches,
		onSelectDay,
		selectedDay = null,
		selectedDays = []
	}: Props = $props();

	const selected = (date: string) => selectedDay === date || selectedDays.includes(date);

	const dates = $derived(rows[0]?.days.map((d) => d.date) ?? []);

	const otherTeam = (day: RosterDay) => teamId !== undefined && day.teamId !== teamId;

	function cellClass(day: RosterDay): string {
		if (otherTeam(day)) return 'text-muted-foreground/40';
		// Each day state in its own colour, as on the daily page (DT10).
		if (day.source === 'absence') return dayTagClass(STATE_TAG[day.absenceType ?? 'other']);
		if (day.shift) return shiftColourClass(day.shift.colour);
		if (day.holiday) return 'bg-muted text-foreground';
		return 'text-muted-foreground';
	}

	function cellText(day: RosterDay): string {
		if (otherTeam(day)) return '·';
		if (day.source === 'absence') return m.roster_letter_absent();
		if (!day.shift && day.holiday) return m.roster_letter_holiday();
		return day.shift?.code ?? m.roster_letter_off();
	}

	function cellTitle(day: RosterDay): string {
		if (otherTeam(day)) return m.roster_preview_other_team();
		if (day.source === 'absence')
			return day.absenceType ? absenceLabel(day.absenceType) : m.roster_preview_absent();
		const kind = slotLabel(day.shift);
		if (day.holiday)
			return day.shift ? m.roster_preview_holiday_work({ kind }) : m.roster_preview_holiday();
		if (day.extra) return m.roster_preview_extra({ kind });
		// A day an approved swap moved (swaps plan SW9).
		if (day.swapRole === 'swap_on') return `${m.daily_badge_swap_on()} · ${kind}`;
		if (day.swapRole === 'swap_off') return m.daily_badge_swap_off();
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
							{const label = $derived(formatPreviewDay(date))}
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
								{const coloured = $derived(day.shift !== null && !otherTeam(day))}
								{const punch = $derived(punches?.[row.id]?.[day.date])}
								<td
									class={cn(
										'h-7 rounded-sm px-0.5 text-center font-semibold',
										cellClass(day),
										selected(day.date) && 'ring-2 ring-ring'
									)}
									title={cellTitle(day)}
								>
									{#snippet content()}
										<span aria-hidden="true">
											<bdi dir="ltr">{cellText(day)}</bdi
											>{#if coloured && day.shift && isNightShift(day.shift)}<span
													class="text-[0.6rem]">🌙</span
												>{/if}{day.swapRole
												? '⇄'
												: day.extra || day.source === 'override'
													? '*'
													: ''}
										</span>
										{#if punch}
											<span
												class="block text-[0.6rem] leading-tight font-normal"
												aria-hidden="true"
											>
												●<bdi dir="ltr"
													>{punch.worked === null ? '…' : formatHoursMinutes(punch.worked)}</bdi
												>
											</span>
										{/if}
										<span class="sr-only">
											{cellTitle(day)}{#if punch}, {punch.worked === null
													? m.roster_preview_punch_open()
													: m.roster_preview_punch_worked({
															time: formatHoursMinutes(punch.worked)
														})}{/if}
										</span>
									{/snippet}
									{#if onSelectDay}
										<button
											type="button"
											class="block size-full rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
											aria-pressed={selected(day.date)}
											onclick={() => onSelectDay(day.date)}
										>
											{@render content()}
										</button>
									{:else}
										{@render content()}
									{/if}
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
