<script lang="ts">
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import type { DayFigures } from '#lib/attendance/day-result.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import { formatRate } from '../patterns/pay-labels.js';
	import { UNPAID_REASON_LABEL } from './day-labels.js';

	// A day's overtime (pay plan PR20): the paid minutes at their rate, or "not paid" with the reason
	// in a tooltip (overtime off, holiday not eligible, a full-day state…).

	type Props = {
		figures: Pick<DayFigures, 'paidOtMinutes' | 'otRate' | 'unpaidExtraMinutes' | 'unpaidReason'>;
	};

	let { figures }: Props = $props();
</script>

<span class="inline-flex flex-wrap items-center gap-1">
	{#if figures.paidOtMinutes > 0}
		<bdi class="font-mono" dir="ltr">
			{formatHoursMinutes(figures.paidOtMinutes)}
			{figures.otRate === null ? '' : formatRate(figures.otRate)}
		</bdi>
	{/if}
	{#if figures.unpaidExtraMinutes > 0}
		<Tooltip.Root>
			<Tooltip.Trigger class="cursor-help text-muted-foreground underline decoration-dotted">
				{m.daily_not_paid({ time: formatHoursMinutes(figures.unpaidExtraMinutes) })}
			</Tooltip.Trigger>
			<Tooltip.Content>
				{figures.unpaidReason
					? UNPAID_REASON_LABEL[figures.unpaidReason]()
					: m.daily_unpaid_unknown()}
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
	{#if figures.paidOtMinutes === 0 && figures.unpaidExtraMinutes === 0}
		<span class="text-muted-foreground">—</span>
	{/if}
</span>
