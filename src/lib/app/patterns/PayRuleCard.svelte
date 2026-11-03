<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import CalendarPlusIcon from 'phosphor-svelte/lib/CalendarPlusIcon';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type {
		PayRule,
		PayRuleField,
		PayRuleSource,
		ResolvedPayRule
	} from '#lib/payroll/pay-rule.js';
	import type {
		PatternPayMessage,
		payRuleFormSchema,
		payRuleResetSchema
	} from '#lib/schemas/pattern-pay.schema.js';
	import type { PayRuleRow } from '#lib/server/services/pattern-pay/pattern-pay.crud.js';
	import PayRuleFormSheet from './PayRuleFormSheet.svelte';
	import PayRuleResetSheet from './PayRuleResetSheet.svelte';
	import { formatRate, VERSION_STATE_LABEL, versionState } from './pay-labels.js';

	// A pay rule's card (pay plan PR12, PR35): a pattern's "Overtime & pay" tab, or the company's on
	// /admin/settings.

	type Props = {
		/** The rule in force today with each value's source, and the owner's versions. */
		pay: { rule: ResolvedPayRule; versions: PayRuleRow[] };
		/** What an empty value falls back to, and where that comes from. */
		inherited: PayRule;
		inheritLabel: string;
		title: string;
		description: string;
		/** Shown when the owner has no version yet. */
		empty: string;
		/** The sheets' forms; `null` without `roster.manage`. */
		forms: {
			rule: SuperValidated<Infer<typeof payRuleFormSchema>, PatternPayMessage>;
			reset: SuperValidated<Infer<typeof payRuleResetSchema>, PatternPayMessage>;
		} | null;
		today: string;
	};

	let { pay, inherited, inheritLabel, title, description, empty, forms, today }: Props = $props();

	let ruleOpen = $state(false);
	let resetOpen = $state(false);

	const SOURCE_LABEL: Record<PayRuleSource, () => string> = {
		pattern: m.pattern_pay_source_pattern,
		company: m.pattern_pay_source_company,
		default: m.pattern_pay_source_default
	};

	const tiles = $derived(
		(
			[
				['otEnabled', m.pattern_pay_overtime()],
				['workDayRate', m.pattern_pay_work_day()],
				['offDayRate', m.pattern_pay_off_day()],
				['holidayRate', m.pattern_pay_holiday()]
			] as const
		).map(([field, label]) => ({
			field: field as PayRuleField,
			label,
			value:
				field === 'otEnabled'
					? pay.rule.rule.otEnabled
						? m.pattern_pay_on()
						: m.pattern_pay_off()
					: formatRate(pay.rule.rule[field]),
			source: pay.rule.sources[field]
		}))
	);

	/** A version's value of one field: its own, or "inherited". */
	function cell(value: number | boolean | null): string {
		if (value === null) return m.pattern_pay_inherit();
		if (typeof value === 'boolean') return value ? m.pattern_pay_on() : m.pattern_pay_off();
		return formatRate(value);
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
		{#if forms}
			<Card.Action class="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" onclick={() => (ruleOpen = true)}>
					<CalendarPlusIcon data-icon="inline-start" />
					{m.pattern_pay_change()}
				</Button>
				{#if pay.versions.length > 0}
					<Button variant="ghost" size="sm" onclick={() => (resetOpen = true)}>
						<ArrowCounterClockwiseIcon data-icon="inline-start" />
						{m.pattern_pay_reset()}
					</Button>
				{/if}
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-medium">{m.pattern_pay_today()}</h3>
			<dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{#each tiles as tile (tile.field)}
					<div class="flex flex-col gap-1 rounded-md bg-muted/50 p-3">
						<dt class="text-xs text-muted-foreground">{tile.label}</dt>
						<dd class="font-mono text-lg font-semibold"><bdi dir="ltr">{tile.value}</bdi></dd>
						<dd>
							<Badge variant={tile.source === 'default' ? 'outline' : 'secondary'}>
								{SOURCE_LABEL[tile.source]()}
							</Badge>
						</dd>
					</div>
				{/each}
			</dl>
		</div>

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-medium">{m.pattern_pay_versions()}</h3>
			{#if pay.versions.length === 0}
				<p class="text-sm text-muted-foreground">{empty}</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.pattern_pay_col_from()}</Table.Head>
							<Table.Head>{m.pattern_pay_col_until()}</Table.Head>
							<Table.Head>{m.pattern_pay_overtime()}</Table.Head>
							<Table.Head>{m.pattern_pay_work_day()}</Table.Head>
							<Table.Head>{m.pattern_pay_off_day()}</Table.Head>
							<Table.Head>{m.pattern_pay_holiday()}</Table.Head>
							<Table.Head>{m.roster_field_reason()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each pay.versions.toReversed() as version (version.id)}
							{const state = $derived(versionState(version, today))}
							<Table.Row class={state === 'past' ? 'text-muted-foreground' : undefined}>
								<Table.Cell>
									<div class="flex flex-wrap items-center gap-2">
										<bdi>{formatCalendarDate(version.effectiveFrom)}</bdi>
										<Badge variant={state === 'current' ? 'secondary' : 'outline'}>
											{VERSION_STATE_LABEL[state]()}
										</Badge>
									</div>
								</Table.Cell>
								<Table.Cell>
									{#if version.effectiveTo}
										<bdi>{formatCalendarDate(version.effectiveTo)}</bdi>
									{:else}
										{m.pattern_pay_open_ended()}
									{/if}
								</Table.Cell>
								<Table.Cell>{cell(version.otEnabled)}</Table.Cell>
								<Table.Cell><bdi dir="ltr">{cell(version.workDayRate)}</bdi></Table.Cell>
								<Table.Cell><bdi dir="ltr">{cell(version.offDayRate)}</bdi></Table.Cell>
								<Table.Cell><bdi dir="ltr">{cell(version.holidayRate)}</bdi></Table.Cell>
								<Table.Cell class="max-w-64 whitespace-normal">{version.reason}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</div>
	</Card.Content>
</Card.Root>

{#if forms}
	<PayRuleFormSheet data={forms.rule} {inherited} {inheritLabel} {today} bind:open={ruleOpen} />
	<PayRuleResetSheet data={forms.reset} {today} bind:open={resetOpen} />
{/if}
