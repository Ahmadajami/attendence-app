<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { absenceLabel } from '#lib/attendance/labels.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { findDayPunches } from '#lib/remote/day-punches.remote.js';
	import type { AttendanceMessage } from '#lib/schemas/attendance.schema.js';
	import type { dayStateClearSchema, dayStateFormSchema } from '#lib/schemas/day-state.schema.js';
	import type { AbsenceType } from '#lib/schemas/enums.js';
	import { endSide } from '#lib/utils/locale.js';
	import DayPunchesForm from './DayPunchesForm.svelte';
	import DayStateClearForm from './DayStateClearForm.svelte';
	import DayStateSetForm from './DayStateSetForm.svelte';

	// The day editor (pay plan PR19, §5 `DayStateSheet`): type or correct the day's check-in / out
	// (PR46), set a state for one day or a range, or clear it. The daily page and the employee
	// page's day panel open it for one person and day.

	type Props = {
		forms: {
			set: SuperValidated<Infer<typeof dayStateFormSchema>, AttendanceMessage>;
			clear: SuperValidated<Infer<typeof dayStateClearSchema>, AttendanceMessage>;
		};
		/** The person and day; `null` while closed. `state`: the day's state now, if any. */
		target: { staffId: string; name: string; date: string; state: AbsenceType | null } | null;
		open: boolean;
	};

	let { forms, target, open = $bindable() }: Props = $props();

	type Mode = 'punches' | 'set' | 'clear';
	/** Clearing first when the day has a state, else its punches. Starts again for each day opened. */
	let mode = $derived<Mode>(target?.state ? 'clear' : 'punches');
	const hint: Record<Mode, () => string> = {
		punches: m.day_punches_hint,
		set: m.day_state_set_hint,
		clear: m.day_state_clear_hint
	};
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.day_state_title()}</Sheet.Title>
			<Sheet.Description>
				{#if target}
					{m.day_state_description({ name: target.name })}
					<bdi>{formatCalendarDate(target.date)}</bdi>
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		{#if target}
			<div class="flex flex-col gap-4 px-4 pb-4">
				<p class="text-sm">
					{target.state
						? m.day_state_now({ state: absenceLabel(target.state) })
						: m.day_state_now_none()}
				</p>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					class="self-start"
					bind:value={() => mode, (value) => value && (mode = value as Mode)}
				>
					<ToggleGroup.Item value="punches">{m.day_state_mode_punches()}</ToggleGroup.Item>
					<ToggleGroup.Item value="set">{m.day_state_mode_set()}</ToggleGroup.Item>
					<ToggleGroup.Item value="clear">{m.day_state_mode_clear()}</ToggleGroup.Item>
				</ToggleGroup.Root>
				<p class="text-sm text-muted-foreground">
					{hint[mode]()}
				</p>

				<!-- Remounted per person and day, so each form starts from that day. -->
				{#key `${target.staffId}:${target.date}`}
					{#if mode === 'punches'}
						<!-- Loaded when opened, so the form starts from what is recorded now. -->
						{#await findDayPunches({ staffId: target.staffId, date: target.date })}
							<p class="flex items-center gap-2 text-sm text-muted-foreground">
								<SpinnerGapIcon class="size-4 animate-spin" />
								{m.day_punches_loading()}
							</p>
						{:then day}
							{#if day.hasState}
								<p class="text-sm text-muted-foreground">{m.day_punches_has_state()}</p>
							{:else if day.pairs.length > 1}
								<div class="flex flex-col items-start gap-2">
									<p class="text-sm text-muted-foreground">{m.day_punches_several()}</p>
									<Button
										variant="outline"
										size="sm"
										href={`${localizedHref('/employees/[id]', { id: target.staffId })}?tab=schedule&from=${target.date}&day=${target.date}`}
									>
										{m.day_punches_open_employee()}
									</Button>
								</div>
							{:else}
								<DayPunchesForm
									{day}
									staffId={target.staffId}
									date={target.date}
									action="?/setDayPunches"
									onSaved={() => (open = false)}
								/>
							{/if}
						{:catch}
							<p class="text-sm text-destructive">{m.day_punches_failed()}</p>
						{/await}
					{:else if mode === 'set'}
						<DayStateSetForm
							data={forms.set}
							staffId={target.staffId}
							date={target.date}
							action="?/setDayState"
							onSaved={() => (open = false)}
						/>
					{:else}
						<DayStateClearForm
							data={forms.clear}
							staffId={target.staffId}
							date={target.date}
							action="?/clearDayState"
							onSaved={() => (open = false)}
						/>
					{/if}
				{/key}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
