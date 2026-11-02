<script lang="ts">
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { calendarDate, clockOf, pairsOf, toPairs, workedMinutes } from '#lib/attendance/entry.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import type { RosterDay } from '#lib/roster/roster.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { AttendanceEventType } from '#lib/schemas/enums.js';
	import type { EventRow } from '#lib/server/services/attendance/attendance.crud.js';
	import { lookupName } from '#lib/utils/locale.js';
	import AddPairForm from './AddPairForm.svelte';
	import CorrectionForm from './CorrectionForm.svelte';

	type Props = {
		staffId: string;
		day: RosterDay;
		/** The person's events on this shift date, corrections and corrected ones included. */
		events: EventRow[];
		/** Every shift (events may point at an inactive one); new pairs offer the active ones. */
		shifts: RosterShift[];
		/** May add and correct punches (`attendance.record`). */
		canRecord: boolean;
	};

	let { staffId, day, events, shifts, canRecord }: Props = $props();

	const byId = $derived(new Map(shifts.map((s) => [s.id, s])));
	const activeShifts = $derived(shifts.filter((s) => s.active));

	/** The event that corrects each corrected event. */
	const correctionOf = $derived(
		new Map(events.flatMap((e) => (e.correctsEventId ? [[e.correctsEventId, e] as const] : [])))
	);
	/** Every event but void corrections (they show on the event they remove), in time order. */
	const listed = $derived(
		events
			.filter((e) => !e.isVoid)
			.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
	);
	const worked = $derived(workedMinutes(toPairs(pairsOf(events))));

	function typeLabel(type: AttendanceEventType): string {
		if (type === 'check_in') return m.attendance_type_check_in();
		if (type === 'check_out') return m.attendance_type_check_out();
		if (type === 'break_start') return m.attendance_type_break_start();
		return m.attendance_type_break_end();
	}

	/** The event whose correction form is open. */
	let correcting = $state<string | null>(null);
	let adding = $state(false);
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center gap-2">
		<h3 class="font-medium"><bdi>{formatCalendarDate(day.date)}</bdi></h3>
		{#if day.source === 'absence'}
			<Badge variant="outline">{m.roster_preview_absent()}</Badge>
		{:else if day.shift}
			<ShiftChip shift={day.shift} />
			<span class="text-sm text-muted-foreground">
				{lookupName(day.shift)} ·
				<bdi dir="ltr">{day.shift.startTime.slice(0, 5)} → {day.shift.endTime.slice(0, 5)}</bdi>
			</span>
		{:else}
			<Badge variant="outline">{m.roster_kind_off()}</Badge>
		{/if}
		{#if worked !== null}
			<span class="ms-auto text-sm">
				{m.attendance_worked({ time: formatHoursMinutes(worked) })}
			</span>
		{/if}
	</div>

	{#if listed.length === 0}
		<p class="text-sm text-muted-foreground">{m.attendance_no_punches()}</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each listed as event (event.id)}
				{const correction = $derived(correctionOf.get(event.id))}
				{const shift = $derived(byId.get(event.shiftId))}
				<li class="flex flex-col gap-2 rounded-md border p-2">
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<span class={correction ? 'text-muted-foreground line-through' : 'font-medium'}>
							<bdi dir="ltr">{clockOf(event.occurredAt)}</bdi>
							· {typeLabel(event.type)}
						</span>
						{#if calendarDate(event.occurredAt) !== day.date}
							<Badge variant="secondary">{m.attendance_next_day()}</Badge>
						{/if}
						{#if shift}<ShiftChip {shift} />{/if}
						{#if event.correctsEventId}
							<Badge variant="outline">{m.attendance_correction()}</Badge>
						{/if}
						{#if event.source !== 'manual'}
							<Badge variant="outline">{m.attendance_source_seed()}</Badge>
						{/if}
						{#if canRecord && !correction}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="ms-auto"
								aria-expanded={correcting === event.id}
								onclick={() => (correcting = correcting === event.id ? null : event.id)}
							>
								<PencilSimpleIcon data-icon="inline-start" />
								{m.attendance_correct()}
							</Button>
						{/if}
					</div>
					{#if correction}
						<p class="text-xs text-muted-foreground">
							{correction.isVoid ? m.attendance_removed() : m.attendance_corrected()}:
							{correction.reason}
						</p>
					{/if}
					{#if correcting === event.id}
						<CorrectionForm
							eventId={event.id}
							onSaved={() => (correcting = null)}
							onCancel={() => (correcting = null)}
						/>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if canRecord}
		{#if adding}
			<AddPairForm
				{staffId}
				shiftDate={day.date}
				plannedShiftId={day.shiftId}
				shifts={activeShifts}
				onSaved={() => (adding = false)}
				onCancel={() => (adding = false)}
			/>
		{:else}
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="self-start"
				onclick={() => (adding = true)}
			>
				<PlusIcon data-icon="inline-start" />
				{m.attendance_add_pair()}
			</Button>
		{/if}
	{/if}
</div>
