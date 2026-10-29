<script lang="ts">
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import BuildingsIcon from 'phosphor-svelte/lib/BuildingsIcon';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';
	import UsersFourIcon from 'phosphor-svelte/lib/UsersFourIcon';
	import PatternBuilder from '#lib/app/patterns/PatternBuilder.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
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

	<!-- The page is reused when "change from a date" moves to the copy: remount the builder. -->
	{#key data.pattern.id}
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
	{/key}
</section>
