<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { m } from '#lib/paraglide/messages.js';
	import type { Staffing } from '#lib/roster/assignments.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import { cn } from '#lib/utils.js';
	import { formatPreviewDay } from '../roster/labels.js';
	import ShiftChip from '../roster/ShiftChip.svelte';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** One entry per date (from `staffing`). */
		days: Staffing[];
		/** Every shift, to label the rows. */
		shifts: Pick<RosterShift, 'id' | 'code' | 'colour' | 'nameEn' | 'nameAr'>[];
		today: string;
	};

	let { days, shifts, today, class: className, ...restProps }: Props = $props();

	/** Rows: the shifts anyone works in the range, in the shifts' order. */
	const rows = $derived(shifts.filter((s) => days.some((d) => (d.shifts[s.id] ?? 0) > 0)));
	const anyAbsent = $derived(days.some((d) => d.absent > 0));
	const anyHoliday = $derived(days.some((d) => d.holiday > 0));
</script>

<!-- Counts only, no minimum (builder plan B15). -->
<div class={cn('overflow-x-auto', className)} {...restProps}>
	<table class="w-full border-separate border-spacing-0.5 text-xs">
		<caption class="sr-only">{m.staffing_caption()}</caption>
		<thead>
			<tr>
				<th scope="col" class="sticky inset-s-0 bg-card pe-2 text-start font-medium">
					<span class="sr-only">{m.staffing_shift()}</span>
				</th>
				{#each days as day (day.date)}
					{const label = $derived(formatPreviewDay(day.date))}
					<th
						scope="col"
						class={cn(
							'min-w-7 px-0.5 text-center font-normal text-muted-foreground',
							day.date === today && 'font-semibold text-foreground'
						)}
					>
						<span class="block">{label.weekday}</span>
						<span class="block">{label.day}</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as shift (shift.id)}
				<tr>
					<th scope="row" class="sticky inset-s-0 bg-card pe-2 text-start font-normal">
						<ShiftChip {shift} />
					</th>
					{#each days as day (day.date)}
						<td class="h-7 text-center tabular-nums">{day.shifts[shift.id] ?? 0}</td>
					{/each}
				</tr>
			{/each}
			<tr class="text-muted-foreground">
				<th scope="row" class="sticky inset-s-0 bg-card pe-2 text-start font-normal">
					{m.staffing_off()}
				</th>
				{#each days as day (day.date)}
					<td class="h-7 text-center tabular-nums">{day.off}</td>
				{/each}
			</tr>
			{#if anyHoliday}
				<tr class="text-muted-foreground">
					<th scope="row" class="sticky inset-s-0 bg-card pe-2 text-start font-normal">
						{m.staffing_holiday()}
					</th>
					{#each days as day (day.date)}
						<td
							class={cn(
								'h-7 text-center tabular-nums',
								day.holiday > 0 && 'bg-muted font-semibold text-foreground'
							)}
						>
							{day.holiday}
						</td>
					{/each}
				</tr>
			{/if}
			{#if anyAbsent}
				<tr class="text-muted-foreground">
					<th scope="row" class="sticky inset-s-0 bg-card pe-2 text-start font-normal">
						{m.staffing_absent()}
					</th>
					{#each days as day (day.date)}
						<td class="h-7 text-center tabular-nums">{day.absent}</td>
					{/each}
				</tr>
			{/if}
		</tbody>
	</table>
</div>
