<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import BuildingsIcon from 'phosphor-svelte/lib/BuildingsIcon';
	import CalendarStarIcon from 'phosphor-svelte/lib/CalendarStarIcon';
	import CurrencyCircleDollarIcon from 'phosphor-svelte/lib/CurrencyCircleDollarIcon';
	import GridFourIcon from 'phosphor-svelte/lib/GridFourIcon';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';
	import UsersFourIcon from 'phosphor-svelte/lib/UsersFourIcon';
	import PatternBuilder from '#lib/app/patterns/PatternBuilder.svelte';
	import PatternDatesTab from '#lib/app/patterns/PatternDatesTab.svelte';
	import PayRuleCard from '#lib/app/patterns/PayRuleCard.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as UnderlineTabs from '#lib/components/ui/underline-tabs/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const kindIcon = { staff: UserIcon, team: UsersFourIcon, department: BuildingsIcon } as const;
	const followerHref = (kind: 'staff' | 'team' | 'department', id: string) =>
		kind === 'staff'
			? localizedHref('/employees/[id]', { id })
			: kind === 'team'
				? localizedHref('/teams/[id]', { id })
				: localizedHref('/departments');

	/** The open tab lives in `?tab=` (pay plan PR12). The load ignores it: switching never refetches. */
	const TABS = ['days', 'pay', 'dates'] as const;
	type Tab = (typeof TABS)[number];
	const tab = $derived.by((): Tab => {
		const value = page.url.searchParams.get('tab');
		return TABS.includes(value as Tab) ? (value as Tab) : 'days';
	});

	function setTab(next: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('tab', next);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only `?tab=` changes
		void goto(url, { replace: true, reset: false });
	}
</script>

<svelte:head>
	<title>{lookupName(data.pattern)} · {m.patterns_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-2">
		<Button href={localizedHref('/patterns')} variant="ghost" size="sm" class="self-start">
			<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
			{m.patterns_back()}
		</Button>
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="text-2xl font-semibold tracking-tight">{lookupName(data.pattern)}</h2>
			{#if !data.pattern.active}
				<Badge variant="outline">{m.patterns_inactive()}</Badge>
			{/if}
		</div>
		<div class="flex flex-col gap-1.5 text-sm">
			<p class="text-muted-foreground">
				{m.patterns_following({ count: data.pattern.followers.length })}
			</p>
			{#if data.pattern.followers.length > 0}
				<ul class="flex flex-wrap gap-1.5">
					{#each data.pattern.followers as follower (`${follower.kind}:${follower.id}:${follower.effectiveFrom}`)}
						{const Icon = $derived(kindIcon[follower.kind])}
						<li>
							<a href={followerHref(follower.kind, follower.id)}>
								<Badge variant="outline" class="gap-1">
									<Icon class="size-3.5" />
									{personName({ fullName: follower.nameEn, fullNameAr: follower.nameAr })}
									{#if follower.effectiveFrom > data.today}
										<span class="text-muted-foreground">
											{m.roster_member_from({ date: formatCalendarDate(follower.effectiveFrom) })}
										</span>
									{/if}
								</Badge>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>

	<UnderlineTabs.Root bind:value={() => tab, setTab}>
		<UnderlineTabs.List class="max-w-full overflow-x-auto">
			<UnderlineTabs.Trigger value="days">
				<GridFourIcon />
				{m.pattern_tab_days()}
			</UnderlineTabs.Trigger>
			<UnderlineTabs.Trigger value="pay">
				<CurrencyCircleDollarIcon />
				{m.pattern_tab_pay()}
			</UnderlineTabs.Trigger>
			<UnderlineTabs.Trigger value="dates">
				<CalendarStarIcon />
				{m.pattern_tab_dates()}
			</UnderlineTabs.Trigger>
		</UnderlineTabs.List>

		<!-- The page is reused when "change from a date" moves to the copy: remount the tabs. -->
		{#key data.pattern.id}
			<UnderlineTabs.Content value="days" class="flex flex-col gap-4">
				<PatternBuilder
					form={data.form}
					shifts={data.shifts}
					targets={data.targets}
					departments={data.departments}
					today={data.today}
					canManage={data.canManage}
					pattern={data.pattern}
					returnTarget={null}
					editForm={data.editForm}
					shiftForm={data.shiftForm}
				/>
			</UnderlineTabs.Content>

			<UnderlineTabs.Content value="pay" class="flex flex-col gap-4">
				<PayRuleCard
					pay={data.pay}
					inherited={data.pay.companyRule.rule}
					inheritLabel={m.pattern_pay_source_company()}
					title={m.pattern_pay_title()}
					description={m.pattern_pay_description()}
					empty={m.pattern_pay_versions_none()}
					forms={data.payForms && { rule: data.payForms.rule, reset: data.payForms.reset }}
					today={data.today}
				/>
			</UnderlineTabs.Content>

			<UnderlineTabs.Content value="dates" class="flex flex-col gap-4">
				<PatternDatesTab pay={data.pay} forms={data.payForms} today={data.today} />
			</UnderlineTabs.Content>
		{/key}
	</UnderlineTabs.Root>
</section>
