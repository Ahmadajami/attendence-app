<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import BuildingsIcon from 'phosphor-svelte/lib/BuildingsIcon';
	import CalendarPlusIcon from 'phosphor-svelte/lib/CalendarPlusIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';
	import UsersFourIcon from 'phosphor-svelte/lib/UsersFourIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import { averageWeeklyMinutes } from '#lib/roster/pattern-stats.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { PatternListItem } from '#lib/server/services/patterns/patterns.bl.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import ShiftChip from '../roster/ShiftChip.svelte';

	type Props = {
		pattern: PatternListItem;
		shifts: ReadonlyMap<string, RosterShift>;
		canManage: boolean;
		onCopy: (pattern: PatternListItem) => void;
		onSetActive: (pattern: PatternListItem, active: boolean) => void;
	};

	let { pattern, shifts, canManage, onCopy, onSetActive }: Props = $props();

	const name = $derived(lookupName(pattern));
	const weekly = $derived(formatHoursMinutes(averageWeeklyMinutes(pattern, shifts)));
	const kindIcon = { staff: UserIcon, team: UsersFourIcon, department: BuildingsIcon } as const;
	/** The pattern page with step 3 (assign) open. */
	const assignHref = $derived(
		`${localizedHref('/patterns/[id]', { id: pattern.id })}?step=assign` as ResolvedPathname
	);
</script>

<Card.Root class={pattern.active ? undefined : 'opacity-70'}>
	<Card.Header>
		<Card.Title>
			<a href={localizedHref('/patterns/[id]', { id: pattern.id })} class="hover:underline">
				{name}
			</a>
		</Card.Title>
		<Card.Description class="flex flex-wrap items-center gap-2">
			<Badge variant="secondary">
				{pattern.type === 'weekly'
					? m.roster_type_weekly()
					: m.patterns_cycle_days({ days: pattern.slots.length })}
			</Badge>
			<span>{m.patterns_avg_week({ time: weekly })}</span>
			{#if !pattern.active}
				<Badge variant="outline">{m.patterns_inactive()}</Badge>
			{/if}
			{#if pattern.hasPayRule}
				<Badge variant="outline">{m.pattern_badge_pay()}</Badge>
			{/if}
			{#if pattern.upcomingHolidays > 0}
				<Badge variant="outline">
					{m.pattern_badge_holidays({ count: pattern.upcomingHolidays })}
				</Badge>
			{/if}
		</Card.Description>
		<Card.Action>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							aria-label={m.patterns_actions({ name })}
						>
							<DotsThreeIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={localizedHref('/patterns/[id]', { id: pattern.id })}>
								<PencilSimpleIcon />
								{canManage ? m.patterns_edit() : m.patterns_open()}
							</a>
						{/snippet}
					</DropdownMenu.Item>
					{#if canManage}
						<DropdownMenu.Item onSelect={() => onCopy(pattern)}>
							<CopyIcon />
							{m.patterns_copy()}
						</DropdownMenu.Item>
						{#if pattern.active}
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a {...props} href={assignHref}>
										<CalendarPlusIcon />
										{m.patterns_assign()}
									</a>
								{/snippet}
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Separator />
						{#if pattern.active}
							<DropdownMenu.Item variant="destructive" onSelect={() => onSetActive(pattern, false)}>
								<ProhibitIcon />
								{m.patterns_deactivate()}
							</DropdownMenu.Item>
						{:else}
							<DropdownMenu.Item onSelect={() => onSetActive(pattern, true)}>
								<CheckCircleIcon />
								{m.patterns_activate()}
							</DropdownMenu.Item>
						{/if}
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<div class="flex flex-wrap gap-1">
			{#each pattern.slots as slot, index (index)}
				<ShiftChip shift={slot === null ? null : (shifts.get(slot) ?? null)} />
			{/each}
		</div>
		<div class="flex flex-col gap-1.5 text-sm">
			<p class="text-muted-foreground">
				{m.patterns_following({ count: pattern.followers.length })}
			</p>
			{#if pattern.followers.length > 0}
				<ul class="flex flex-wrap gap-1.5">
					{#each pattern.followers as follower (`${follower.kind}:${follower.id}:${follower.effectiveFrom}`)}
						{const Icon = $derived(kindIcon[follower.kind])}
						<li>
							<Badge variant="outline" class="gap-1">
								<Icon class="size-3.5" />
								{personName({ fullName: follower.nameEn, fullNameAr: follower.nameAr })}
							</Badge>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
