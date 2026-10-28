<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { enhance, type SubmitFunction } from '$app/forms';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import {
		calendarDate,
		clockOf,
		normalizeClock,
		pairsOf,
		toPairs,
		workedMinutes
	} from '#lib/attendance/entry.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import type { RosterDay } from '#lib/roster/roster.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { AttendanceEventType } from '#lib/schemas/enums.js';
	import type { EventRow } from '#lib/server/services/attendance/attendance.crud.js';
	import { lookupName } from '#lib/utils/locale.js';

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

	let correcting = $state<string | null>(null);
	let correctionTime = $state('');
	let correctionVoid = $state(false);
	let adding = $state(false);
	let addShiftId = $state(untrack(() => day.shiftId ?? shifts.find((s) => s.active)?.id ?? ''));
	let addIn = $state('');
	let addOut = $state('');

	function startCorrection(id: string) {
		correcting = correcting === id ? null : id;
		correctionTime = '';
		correctionVoid = false;
	}

	const toastNotice: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' || result.type === 'failure') {
				const notice = result.data?.notice;
				if (typeof notice === 'string') {
					if (result.type === 'success') toast.success(notice);
					else toast.error(notice);
				}
				if (result.type === 'success') {
					correcting = null;
					adding = false;
					addIn = '';
					addOut = '';
				}
			}
			await update({ reset: result.type === 'success' });
		};
	};
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
				{const correction = correctionOf.get(event.id)}
				{const shift = byId.get(event.shiftId)}
				<li class="flex flex-col gap-2 rounded-md border p-2">
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<span class={correction ? 'text-muted-foreground line-through' : 'font-medium'}>
							<bdi dir="ltr">{clockOf(event.occurredAt)}</bdi>
							{#if calendarDate(event.occurredAt) !== day.date}
								<Badge variant="secondary">{m.attendance_next_day()}</Badge>
							{/if}
							· {typeLabel(event.type)}
						</span>
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
								onclick={() => startCorrection(event.id)}
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
						<form
							method="POST"
							action="?/correctEvent"
							class="flex flex-wrap items-end gap-2"
							use:enhance={toastNotice}
						>
							<input type="hidden" name="eventId" value={event.id} />
							<label class="flex flex-col gap-1 text-xs">
								{m.attendance_new_time()}
								<Input
									name="time"
									bind:value={correctionTime}
									onblur={() => (correctionTime = normalizeClock(correctionTime))}
									class="h-8 w-20 font-mono"
									dir="ltr"
									inputmode="numeric"
									placeholder="HH:mm"
									disabled={correctionVoid}
									required={!correctionVoid}
								/>
							</label>
							<label class="flex items-center gap-1.5 pb-1.5 text-xs">
								<input type="checkbox" bind:checked={correctionVoid} />
								{m.attendance_remove_event()}
							</label>
							<label class="flex min-w-48 flex-1 flex-col gap-1 text-xs">
								{m.roster_field_reason()}
								<Input name="reason" class="h-8" required />
							</label>
							<Button type="submit" size="sm">{m.attendance_save_correction()}</Button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if canRecord}
		{#if adding}
			<form
				method="POST"
				action="?/addPair"
				class="flex flex-wrap items-end gap-2"
				use:enhance={toastNotice}
			>
				<input type="hidden" name="staffId" value={staffId} />
				<input type="hidden" name="shiftDate" value={day.date} />
				<label class="flex flex-col gap-1 text-xs">
					{m.attendance_col_shift()}
					<select
						name="shiftId"
						bind:value={addShiftId}
						class="h-8 rounded-md border border-input bg-background px-2 text-sm"
					>
						{#each activeShifts as option (option.id)}
							<option value={option.id}>{option.code} · {lookupName(option)}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1 text-xs">
					{m.attendance_col_in()}
					<Input
						name="checkIn"
						bind:value={addIn}
						onblur={() => (addIn = normalizeClock(addIn))}
						class="h-8 w-20 font-mono"
						dir="ltr"
						inputmode="numeric"
						placeholder="HH:mm"
						required
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs">
					{m.attendance_col_out()}
					<Input
						name="checkOut"
						bind:value={addOut}
						onblur={() => (addOut = normalizeClock(addOut))}
						class="h-8 w-20 font-mono"
						dir="ltr"
						inputmode="numeric"
						placeholder="HH:mm"
					/>
				</label>
				<label class="flex min-w-48 flex-1 flex-col gap-1 text-xs">
					{m.roster_field_reason()}
					<Input
						name="reason"
						class="h-8"
						placeholder={addShiftId === day.shiftId
							? m.attendance_reason_optional()
							: m.attendance_reason_required()}
					/>
				</label>
				<Button type="submit" size="sm">{m.attendance_save()}</Button>
			</form>
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
