<script lang="ts">
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LogField } from '#lib/schemas/enums.js';
	import type { DayHistoryLine } from '#lib/server/services/daily/daily.bl.js';
	import { formatDateTime } from '#lib/utils/datetime.js';
	import { endSide, personName } from '#lib/utils/locale.js';
	import { formatLogValue, LOG_FIELD_LABEL, LOG_SOURCE_LABEL } from './day-labels.js';
	import { causeHref, fetchDayHistory } from './history.js';

	// A day's edit log (pay plan PR24, §5 `DayHistorySheet`): newest first, each line with its time,
	// the value old → new, where the change came from, who made it and a link to its cause. Loaded
	// when the sheet opens; filtered by field in the browser.

	type Props = {
		/** The person and day; `null` while closed. */
		target: { staffId: string; name: string; date: string } | null;
		/** Every shift, to show a logged shift by its code. */
		shifts: { id: string; code: string }[];
		open: boolean;
	};

	let { target, shifts, open = $bindable() }: Props = $props();

	/** The log, fetched each time the sheet opens on a day (a new promise per day). */
	const request = $derived(open && target ? fetchDayHistory(target.staffId, target.date) : null);
	/** The field filter; back to every field for each new request. */
	let field = $derived.by<LogField | 'all'>(() => {
		void request;
		return 'all';
	});

	const codeOf = $derived(new Map(shifts.map((s) => [s.id, s.code])));
	const fieldLabel = (value: LogField | 'all') =>
		value === 'all' ? m.day_history_all_fields() : LOG_FIELD_LABEL[value]();
	const show = (line: DayHistoryLine, value: DayHistoryLine['oldValue']) =>
		formatLogValue(line.field, value, (id) => codeOf.get(id));
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="w-full overflow-y-auto sm:max-w-lg">
		<Sheet.Header>
			<Sheet.Title>{m.day_history_title()}</Sheet.Title>
			<Sheet.Description>
				{#if target}
					{m.day_history_description({ name: target.name })}
					<bdi>{formatCalendarDate(target.date)}</bdi>
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-col gap-4 px-4 pb-4">
			{#await request}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<SpinnerGapIcon class="size-4 animate-spin" />
					{m.day_history_loading()}
				</p>
			{:then lines}
				{const all = $derived(lines ?? [])}
				{const fields = $derived([...new Set(all.map((l) => l.field))])}
				{const shown = $derived(all.filter((l) => field === 'all' || l.field === field))}
				{#if all.length === 0}
					<p class="text-sm text-muted-foreground">{m.day_history_empty()}</p>
				{:else}
					<div class="flex flex-col gap-2">
						<Label for="day-history-field">{m.day_history_filter()}</Label>
						<Select.Root
							type="single"
							bind:value={() => field, (value) => (field = value as LogField | 'all')}
						>
							<Select.Trigger id="day-history-field" class="w-56">
								{fieldLabel(field)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="all" label={fieldLabel('all')} />
								{#each fields as option (option)}
									<Select.Item value={option} label={fieldLabel(option)} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<ol class="flex flex-col gap-2">
						{#each shown as line (line.id)}
							{const href = $derived(target ? causeHref(line, target.staffId, target.date) : null)}
							<li class="flex flex-col gap-1 rounded-md border p-2 text-sm">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-medium">{LOG_FIELD_LABEL[line.field]()}</span>
									<Badge variant="outline">{LOG_SOURCE_LABEL[line.source]()}</Badge>
									<bdi class="ms-auto text-xs text-muted-foreground">
										{formatDateTime(new Date(line.at))}
									</bdi>
								</div>
								{#if line.field === 'created'}
									<p>{m.day_history_created({ kind: show(line, line.newValue) })}</p>
								{:else}
									<p class="flex flex-wrap items-center gap-1">
										<bdi>{show(line, line.oldValue)}</bdi>
										<ArrowRightIcon class="size-3.5 text-muted-foreground rtl:rotate-180" />
										<bdi class="font-medium">{show(line, line.newValue)}</bdi>
									</p>
								{/if}
								{#if line.reason}
									<p class="text-xs">{m.day_history_reason({ reason: line.reason })}</p>
								{/if}
								<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span>{line.actor ? personName(line.actor) : m.day_history_system()}</span>
									{#if href}
										<Button variant="link" size="sm" class="h-auto p-0 text-xs" {href}>
											{m.day_history_cause_link()}
										</Button>
									{/if}
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			{:catch error}
				<p class="text-sm text-destructive">
					{error instanceof Error ? error.message : String(error)}
				</p>
			{/await}
		</div>
	</Sheet.Content>
</Sheet.Root>
