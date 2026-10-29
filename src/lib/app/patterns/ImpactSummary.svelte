<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { m } from '#lib/paraglide/messages.js';
	import type { TargetImpact } from '#lib/server/services/assignments/assignments.bl.js';
	import { cn } from '#lib/utils.js';
	import { personName } from '#lib/utils/locale.js';

	type Props = HTMLAttributes<HTMLDivElement> & { impacts: TargetImpact[] };

	let { impacts, class: className, ...restProps }: Props = $props();

	const name = (t: TargetImpact) => personName({ fullName: t.nameEn, fullNameAr: t.nameAr });
</script>

<div class={cn('flex flex-col gap-3 text-sm', className)} aria-live="polite" {...restProps}>
	{#each impacts as target (`${target.kind}:${target.id}`)}
		{const i = $derived(target.impact)}
		<div class="flex flex-col gap-1">
			<p class="font-medium">
				{m.assign_impact_applies({ name: name(target), applies: i.applies, people: i.people })}
			</p>
			<dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-muted-foreground">
				{#snippet row(label: string, value: number)}
					{#if value > 0}
						<dt>{label}</dt>
						<dd class="text-end tabular-nums">{value}</dd>
					{/if}
				{/snippet}
				{@render row(m.assign_impact_own_pattern(), i.ownPattern)}
				{@render row(m.assign_impact_own_off_days(), i.ownOffDays)}
				{@render row(m.assign_impact_crew_starts(), i.crewStarts)}
				{@render row(m.assign_impact_not_members(), i.notMembers)}
				{@render row(m.assign_impact_override_days(), i.overrideDays)}
				{@render row(m.assign_impact_absence_days(), i.absenceDays)}
				{@render row(m.assign_impact_punched_days(), i.punchedDays)}
			</dl>
		</div>
	{/each}
</div>
