<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type {
		holidayCancelSchema,
		holidayExceptionSchema,
		holidayFormSchema,
		missionCancelSchema,
		missionFormSchema,
		PatternPayMessage
	} from '#lib/schemas/pattern-pay.schema.js';
	import type {
		CompanyHolidayForPattern,
		PatternMission,
		PatternPay
	} from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import HolidayCard from './HolidayCard.svelte';
	import HolidayExceptionSheet from './HolidayExceptionSheet.svelte';
	import MissionCancelSheet from './MissionCancelSheet.svelte';
	import MissionFormSheet from './MissionFormSheet.svelte';
	import { formatDateRange, HOLIDAY_STATE_LABEL, holidayState } from './pay-labels.js';

	type Props = {
		pay: PatternPay;
		/** The sheets' forms; `null` without `roster.manage`. */
		forms: {
			holiday: SuperValidated<Infer<typeof holidayFormSchema>, PatternPayMessage>;
			holidayCancel: SuperValidated<Infer<typeof holidayCancelSchema>, PatternPayMessage>;
			exception: SuperValidated<Infer<typeof holidayExceptionSchema>, PatternPayMessage>;
			mission: SuperValidated<Infer<typeof missionFormSchema>, PatternPayMessage>;
			missionCancel: SuperValidated<Infer<typeof missionCancelSchema>, PatternPayMessage>;
		} | null;
		today: string;
	};

	let { pay, forms, today }: Props = $props();

	let exceptionOpen = $state(false);
	let changing = $state<CompanyHolidayForPattern | null>(null);

	let missionOpen = $state(false);
	let cancelMissionOpen = $state(false);
	let missionTarget = $state<{ mission: PatternMission; staffId: string } | null>(null);

	function changeException(holiday: CompanyHolidayForPattern) {
		changing = holiday;
		exceptionOpen = true;
	}

	function cancelMission(mission: PatternMission, staffId = '') {
		missionTarget = { mission, staffId };
		cancelMissionOpen = true;
	}

	/** How this pattern treats a company holiday (PR36). */
	function treatment(holiday: CompanyHolidayForPattern): string {
		const e = holiday.exception;
		if (e && !e.applies) return m.pattern_exception_skipped();
		if (e?.otEligible != null && e.otEligible !== holiday.otEligible)
			return m.pattern_exception_own_ot();
		return m.pattern_exception_applies();
	}

	/** The overtime switch this pattern's people get on the holiday. */
	const eligible = (holiday: CompanyHolidayForPattern) =>
		holiday.exception?.otEligible ?? holiday.otEligible;
</script>

<HolidayCard
	holidays={pay.holidays}
	forms={forms && { holiday: forms.holiday, holidayCancel: forms.holidayCancel }}
	title={m.pattern_own_holidays_title()}
	description={m.pattern_holiday_description()}
	{today}
/>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.pattern_company_holidays_title()}</Card.Title>
		<Card.Description>{m.pattern_company_holidays_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if pay.companyHolidays.length === 0}
			<p class="text-sm text-muted-foreground">{m.pattern_company_holidays_none()}</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.pattern_holiday_col_name()}</Table.Head>
						<Table.Head>{m.pattern_holiday_col_dates()}</Table.Head>
						<Table.Head>{m.pattern_pay_overtime()}</Table.Head>
						<Table.Head>{m.pattern_exception_applies()}</Table.Head>
						{#if forms}
							<Table.Head><span class="sr-only">{m.pattern_exception_change()}</span></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each pay.companyHolidays as holiday (holiday.id)}
						{const state = $derived(holidayState(holiday, today))}
						{const skipped = $derived(holiday.exception?.applies === false)}
						<Table.Row class={state === 'past' || skipped ? 'text-muted-foreground' : undefined}>
							<Table.Cell>
								<div class="flex flex-wrap items-center gap-2">
									<span class={skipped ? 'line-through' : 'font-medium'}>
										{lookupName(holiday)}
									</span>
									<Badge variant={state === 'ongoing' ? 'secondary' : 'outline'}>
										{HOLIDAY_STATE_LABEL[state]()}
									</Badge>
								</div>
							</Table.Cell>
							<Table.Cell>
								<bdi>{formatDateRange(holiday.startsOn, holiday.endsOn)}</bdi>
							</Table.Cell>
							<Table.Cell>
								{#if !skipped}
									{eligible(holiday)
										? m.pattern_holiday_eligible()
										: m.pattern_holiday_not_eligible()}
								{/if}
							</Table.Cell>
							<Table.Cell>
								<Badge variant={holiday.exception ? 'secondary' : 'outline'}>
									{treatment(holiday)}
								</Badge>
							</Table.Cell>
							{#if forms}
								<Table.Cell class="text-end">
									<Button
										variant="ghost"
										size="sm"
										aria-label={m.pattern_exception_change_label({ name: lookupName(holiday) })}
										onclick={() => changeException(holiday)}
									>
										<PencilSimpleIcon data-icon="inline-start" />
										{m.pattern_exception_change()}
									</Button>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.pattern_mission_title()}</Card.Title>
		<Card.Description>{m.pattern_mission_description()}</Card.Description>
		{#if forms}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={() => (missionOpen = true)}>
					<PlusIcon data-icon="inline-start" />
					{m.pattern_mission_add()}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if pay.missions.length === 0}
			<p class="text-sm text-muted-foreground">{m.pattern_mission_none()}</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each pay.missions as mission (mission.groupId)}
					<li class="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class={mission.cancelled ? 'text-muted-foreground line-through' : 'font-medium'}
							>
								<bdi>{formatDateRange(mission.startsOn, mission.endsOn)}</bdi>
							</span>
							<Badge variant="outline">
								{m.pattern_mission_people({ count: mission.members.length })}
							</Badge>
							{#if mission.cancelled}
								<Badge variant="outline">{m.pattern_mission_cancelled_badge()}</Badge>
							{:else if forms}
								<Button
									variant="ghost"
									size="sm"
									class="ms-auto"
									onclick={() => cancelMission(mission)}
								>
									<XIcon data-icon="inline-start" />
									{m.pattern_mission_cancel()}
								</Button>
							{/if}
						</div>
						{#if mission.reason}
							<p class="text-sm text-muted-foreground">{mission.reason}</p>
						{/if}
						<ul class="flex flex-wrap gap-1.5">
							{#each mission.members as member (member.absenceId)}
								<li>
									<Badge
										variant="secondary"
										class={['gap-1', member.cancelled && 'line-through opacity-60']}
									>
										{personName(member)}
										{#if forms && !member.cancelled && !mission.cancelled}
											<button
												type="button"
												class="rounded-sm hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
												aria-label={m.pattern_mission_cancel_member({ name: personName(member) })}
												onclick={() => cancelMission(mission, member.staffId)}
											>
												<XIcon class="size-3" />
											</button>
										{/if}
									</Badge>
								</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

{#if forms}
	<HolidayExceptionSheet data={forms.exception} holiday={changing} bind:open={exceptionOpen} />
	<MissionFormSheet data={forms.mission} candidates={pay.candidates} bind:open={missionOpen} />
	<MissionCancelSheet
		data={forms.missionCancel}
		mission={missionTarget?.mission ?? null}
		staffId={missionTarget?.staffId ?? ''}
		bind:open={cancelMissionOpen}
	/>
{/if}
