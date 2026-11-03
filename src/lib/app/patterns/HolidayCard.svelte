<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type {
		holidayCancelSchema,
		holidayFormSchema,
		PatternPayMessage
	} from '#lib/schemas/pattern-pay.schema.js';
	import type { PatternHolidayRow } from '#lib/server/services/pattern-pay/pattern-pay.crud.js';
	import { lookupName } from '#lib/utils/locale.js';
	import HolidayCancelSheet from './HolidayCancelSheet.svelte';
	import HolidayFormSheet from './HolidayFormSheet.svelte';
	import { formatDateRange, HOLIDAY_STATE_LABEL, holidayState } from './pay-labels.js';

	// One owner's holidays (pay plan PR2, PR3, PR8, PR36): a pattern's, or the company's on
	// /admin/settings. The add sheet's form carries the owner.

	type Props = {
		holidays: PatternHolidayRow[];
		/** The sheets' forms; `null` without `roster.manage`. */
		forms: {
			holiday: SuperValidated<Infer<typeof holidayFormSchema>, PatternPayMessage>;
			holidayCancel: SuperValidated<Infer<typeof holidayCancelSchema>, PatternPayMessage>;
		} | null;
		title: string;
		description: string;
		today: string;
	};

	let { holidays, forms, title, description, today }: Props = $props();

	let addOpen = $state(false);
	let cancelOpen = $state(false);
	let cancelling = $state<PatternHolidayRow | null>(null);

	function cancel(holiday: PatternHolidayRow) {
		cancelling = holiday;
		cancelOpen = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
		{#if forms}
			<Card.Action>
				<Button variant="outline" size="sm" onclick={() => (addOpen = true)}>
					<PlusIcon data-icon="inline-start" />
					{m.pattern_holiday_add()}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if holidays.length === 0}
			<p class="text-sm text-muted-foreground">{m.pattern_holiday_none()}</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.pattern_holiday_col_name()}</Table.Head>
						<Table.Head>{m.pattern_holiday_col_dates()}</Table.Head>
						<Table.Head>{m.pattern_pay_overtime()}</Table.Head>
						<Table.Head>{m.roster_field_reason()}</Table.Head>
						{#if forms}
							<Table.Head><span class="sr-only">{m.pattern_holiday_cancel()}</span></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each holidays as holiday (holiday.id)}
						{const state = $derived(holidayState(holiday, today))}
						<Table.Row
							class={state === 'cancelled' || state === 'past'
								? 'text-muted-foreground'
								: undefined}
						>
							<Table.Cell>
								<div class="flex flex-wrap items-center gap-2">
									<span class={state === 'cancelled' ? 'line-through' : 'font-medium'}>
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
								{holiday.otEligible
									? m.pattern_holiday_eligible()
									: m.pattern_holiday_not_eligible()}
							</Table.Cell>
							<Table.Cell class="max-w-64 whitespace-normal">{holiday.reason}</Table.Cell>
							{#if forms}
								<Table.Cell class="text-end">
									{#if state !== 'cancelled'}
										<Button
											variant="ghost"
											size="sm"
											aria-label={m.pattern_holiday_cancel_label({ name: lookupName(holiday) })}
											onclick={() => cancel(holiday)}
										>
											<XIcon data-icon="inline-start" />
											{m.pattern_holiday_cancel()}
										</Button>
									{/if}
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</Card.Content>
</Card.Root>

{#if forms}
	<HolidayFormSheet data={forms.holiday} bind:open={addOpen} />
	<HolidayCancelSheet data={forms.holidayCancel} holiday={cancelling} bind:open={cancelOpen} />
{/if}
