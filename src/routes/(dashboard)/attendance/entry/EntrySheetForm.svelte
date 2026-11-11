<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import DayStatusTags from '#lib/app/attendance/DayStatusTags.svelte';
	import PersonSelect from '#lib/app/people/PersonSelect.svelte';
	import DayTagPopover from '#lib/app/attendance/DayTagPopover.svelte';
	import OvertimeCell from '#lib/app/attendance/OvertimeCell.svelte';
	import PunchTime from '#lib/app/attendance/PunchTime.svelte';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
	import type { DayFigures } from '#lib/attendance/day-result.js';
	import {
		calendarDate,
		clockOf,
		normalizeClock,
		pairsOf,
		resolvePair,
		toPairs,
		validatePair,
		type Pair,
		type PairIssue
	} from '#lib/attendance/entry.js';
	import { absenceLabel, pairIssueMessage } from '#lib/attendance/labels.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatHoursMinutes } from '#lib/roster/overtime.js';
	import type { RosterDay } from '#lib/roster/roster.js';
	import {
		ENTRY_ABSENCES,
		entrySheetSchema,
		type AttendanceMessage
	} from '#lib/schemas/attendance.schema.js';
	import type { EntrySheet } from '#lib/server/services/attendance/attendance.bl.js';
	import type { EventRow } from '#lib/server/services/attendance/attendance.crud.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { personName } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<Infer<typeof entrySheetSchema>, AttendanceMessage>;
		sheet: EntrySheet;
	};

	let { data, sheet }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			// Rows are nested objects.
			dataType: 'json',
			validators: zod4Client(entrySheetSchema),
			...statusToasts()
		}
	);
	const { form: formData, enhance, delayed } = form;

	type ViewRow = {
		person: EntrySheet['rows'][number]['person'];
		day: RosterDay;
		events: EventRow[];
		others: Pair[];
		/** Added with "+ add person" (not planned that day). */
		added: boolean;
		/** The stored daily record (pay plan 5.3); `null` until the day is computed. */
		figures: DayFigures | null;
	};

	let view = $state<ViewRow[]>(untrack(() => sheet.rows.map((row) => ({ ...row, added: false }))));
	let available = $state(untrack(() => sheet.others));

	const shiftsById = $derived(new Map(sheet.shifts.map((s) => [s.id, s])));
	const now = new Date();

	/** The roster's planned shift that day; `null` on a day off (punches carry no shift, PS1). */
	const plannedOf = (day: RosterDay) => (day.shift && day.start ? day.shift : null);

	const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

	/** The pair a row would save, and what the checks say about it (`null`: nothing to check yet). */
	function check(index: number) {
		const row = $formData.rows[index];
		const v = view[index];
		if (row.absence || !CLOCK.test(row.checkIn)) return null;
		if (row.checkOut && !CLOCK.test(row.checkOut)) return null;
		const shift = plannedOf(v.day);
		const pair = resolvePair(sheet.shiftDate, shift, row.checkIn, row.checkOut || null);
		const result = validatePair(pair, {
			shiftDate: sheet.shiftDate,
			shift,
			others: [...v.others, ...toPairs(pairsOf(v.events))],
			now
		});
		return { pair, ...result };
	}

	const checks = $derived($formData.rows.map((_, i) => check(i)));

	const nextDay = (at: Date | null | undefined) =>
		at !== null && at !== undefined && calendarDate(at) !== sheet.shiftDate;

	const issuesText = (issues: PairIssue[]) => issues.map(pairIssueMessage).join(' ');

	/** Check-in inputs by row, so Enter can move to the next row (not reactive state). */
	const checkInInputs: (HTMLInputElement | undefined)[] = [];
	const rememberCheckIn =
		(index: number): Attachment<HTMLInputElement> =>
		(input) => {
			checkInInputs[index] = input;
			return () => {
				if (checkInInputs[index] === input) checkInInputs[index] = undefined;
			};
		};

	/** Enter moves to the next row's check-in instead of submitting. */
	function nextRow(event: KeyboardEvent, index: number) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		checkInInputs[index + 1]?.focus();
	}

	/** Toggle an absence; an absence clears the row's times. */
	function setAbsence(index: number, absence: (typeof ENTRY_ABSENCES)[number]) {
		const row = $formData.rows[index];
		$formData.rows[index] =
			row.absence === absence
				? { ...row, absence: '' }
				: { ...row, absence, checkIn: '', checkOut: '' };
	}

	let addStaffId = $state('');
	/** The people not on the sheet yet, as the add picker lists them. */
	const availablePeople = $derived(available.map((o) => o.person));

	function addPerson() {
		const picked = available.find((o) => o.person.staffId === addStaffId);
		if (!picked) return;
		view = [...view, { ...picked, events: [], added: true, figures: null }];
		available = available.filter((o) => o !== picked);
		$formData.rows = [
			...$formData.rows,
			{
				staffId: picked.person.staffId,
				checkIn: '',
				checkOut: '',
				absence: '',
				reason: ''
			}
		];
		addStaffId = '';
	}
</script>

{#snippet timeField(index: number, key: 'checkIn' | 'checkOut', label: string, at: Date | null)}
	<Form.Field {form} name={`rows[${index}].${key}`}>
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label class="sr-only">{label}</Form.Label>
				<div class="flex items-center gap-1">
					{#if key === 'checkIn'}
						<Input
							{...props}
							bind:value={$formData.rows[index].checkIn}
							onblur={() =>
								($formData.rows[index].checkIn = normalizeClock($formData.rows[index].checkIn))}
							onkeydown={(event) => nextRow(event, index)}
							{@attach rememberCheckIn(index)}
							class="w-20 font-mono"
							dir="ltr"
							inputmode="numeric"
							placeholder={m.attendance_time_placeholder()}
							autocomplete="off"
							disabled={$formData.rows[index].absence !== ''}
						/>
					{:else}
						<Input
							{...props}
							bind:value={$formData.rows[index].checkOut}
							onblur={() =>
								($formData.rows[index].checkOut = normalizeClock($formData.rows[index].checkOut))}
							onkeydown={(event) => nextRow(event, index)}
							class="w-20 font-mono"
							dir="ltr"
							inputmode="numeric"
							placeholder={m.attendance_time_placeholder()}
							autocomplete="off"
							disabled={$formData.rows[index].absence !== ''}
						/>
					{/if}
					{#if nextDay(at)}
						<Badge variant="secondary">{m.attendance_next_day()}</Badge>
					{/if}
				</div>
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
{/snippet}

{#snippet record(figures: DayFigures)}
	<div class="flex flex-col items-start gap-1">
		<span class="flex flex-wrap items-center gap-1">
			<PunchTime
				at={figures.checkIn}
				source={figures.checkInSource}
				shiftDate={figures.shiftDate}
			/>
			→
			<PunchTime
				at={figures.checkOut}
				source={figures.checkOutSource}
				shiftDate={figures.shiftDate}
			/>
		</span>
		{#if figures.workedMinutes !== null}
			<span>
				{m.attendance_worked({ time: formatHoursMinutes(figures.workedMinutes) })}
			</span>
		{/if}
		<span class="flex flex-wrap items-center gap-1">
			{m.daily_col_overtime()}:
			<OvertimeCell {figures} />
		</span>
		<DayStatusTags {figures} shift={figures.shiftId ? shiftsById.get(figures.shiftId) : null} />
	</div>
{/snippet}

<form method="POST" action="?/save" class="flex flex-col gap-4" use:enhance>
	<!-- One explanation popover for the stored records' tags (DT5, DT10). -->
	<DayTagPopover>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.attendance_col_person()}</Table.Head>
					<Table.Head>{m.attendance_col_shift()}</Table.Head>
					<Table.Head>{m.attendance_col_in()}</Table.Head>
					<Table.Head>{m.attendance_col_out()}</Table.Head>
					<Table.Head>{m.attendance_col_absence()}</Table.Head>
					<Table.Head>{m.attendance_col_notes()}</Table.Head>
					<Table.Head>{m.daily_col_record()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each view as v, index (v.person.staffId)}
					{const row = $derived($formData.rows[index])}
					{const result = $derived(checks[index])}
					{const existing = $derived(pairsOf(v.events))}
					{const planned = $derived(plannedOf(v.day))}
					{const name = $derived(personName(v.person))}
					<Table.Row class="align-top">
						<Table.Cell>
							<div class="font-medium">{name}</div>
							<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
								{v.person.employeeNo}
							</bdi>
							<Form.Field {form} name={`rows[${index}].staffId`}>
								<Form.FieldErrors />
							</Form.Field>
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							<div class="flex flex-col gap-1">
								{#if v.day.source === 'absence'}
									<Badge variant="outline">
										{v.day.absenceType
											? absenceLabel(v.day.absenceType)
											: m.roster_preview_absent()}
									</Badge>
								{/if}
								<!-- The roster decides; nobody picks a shift for a punch (PS1–PS3). -->
								{#if planned}
									<span class="inline-flex items-center gap-2">
										<ShiftChip shift={planned} />
										<bdi class="text-sm text-muted-foreground" dir="ltr">
											{planned.startTime.slice(0, 5)} → {planned.endTime.slice(0, 5)}
										</bdi>
									</span>
								{:else if v.day.source !== 'absence'}
									<Badge variant="secondary">{m.attendance_planned_off()}</Badge>
								{/if}
								{#if existing.length > 0}
									<ul class="flex flex-col gap-0.5 text-xs text-muted-foreground">
										{#each existing as pair ((pair.checkIn ?? pair.checkOut)?.id)}
											<li>
												<bdi dir="ltr">
													{pair.checkIn ? clockOf(pair.checkIn.occurredAt) : '—'} →
													{pair.checkOut ? clockOf(pair.checkOut.occurredAt) : '…'}
												</bdi>
												{#if nextDay(pair.checkOut?.occurredAt)}
													{m.attendance_next_day()}
												{/if}
											</li>
										{/each}
										<li>
											<!-- Opens the day panel of this shift date on the employee page. -->
											<Button
												variant="link"
												size="sm"
												class="h-auto p-0 text-xs"
												href={`${localizedHref('/employees/[id]', { id: v.person.staffId })}?from=${sheet.shiftDate}&day=${sheet.shiftDate}`}
											>
												{m.attendance_correct_link()}
											</Button>
										</li>
									</ul>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell>
							{@render timeField(
								index,
								'checkIn',
								m.attendance_in_for({ name }),
								result?.pair.checkIn ?? null
							)}
						</Table.Cell>
						<Table.Cell>
							{@render timeField(
								index,
								'checkOut',
								m.attendance_out_for({ name }),
								result?.pair.checkOut ?? null
							)}
						</Table.Cell>
						<Table.Cell>
							<Form.Fieldset {form} name={`rows[${index}].absence`}>
								<Form.Legend class="sr-only">{m.attendance_absence_for({ name })}</Form.Legend>
								<div class="flex gap-1">
									{#each ENTRY_ABSENCES as absence (absence)}
										<Button
											type="button"
											size="sm"
											variant={row.absence === absence ? 'default' : 'outline'}
											aria-pressed={row.absence === absence}
											tabindex={-1}
											onclick={() => setAbsence(index, absence)}
										>
											{absenceLabel(absence)}
										</Button>
									{/each}
								</div>
								<Form.FieldErrors />
							</Form.Fieldset>
						</Table.Cell>
						<Table.Cell class="min-w-56">
							<div class="flex flex-col gap-1">
								{#if !planned || row.absence}
									<Form.Field {form} name={`rows[${index}].reason`}>
										<Form.Control>
											{#snippet children({ props })}
												<Form.Label class="sr-only">{m.attendance_reason_for({ name })}</Form.Label>
												<Input
													{...props}
													bind:value={$formData.rows[index].reason}
													class="h-8"
													placeholder={m.attendance_reason_optional()}
												/>
											{/snippet}
										</Form.Control>
										<Form.FieldErrors />
									</Form.Field>
								{/if}
								<!-- Live checks: the same helpers the service runs on save. -->
								{#if result && result.errors.length > 0}
									<p class="text-xs text-destructive">{issuesText(result.errors)}</p>
								{/if}
								{#if result && result.warnings.length > 0}
									<p class="text-xs text-warning">{issuesText(result.warnings)}</p>
									{#if planned && result.warnings.includes('outside_window')}
										<!-- Another shift than planned: fix the roster with a shift change (SC5). -->
										<Button
											variant="link"
											size="sm"
											class="h-auto self-start p-0 text-xs"
											href={`${localizedHref('/changes/new')}?kind=shift_change&staff=${v.person.staffId}&date=${sheet.shiftDate}`}
										>
											{m.attendance_shift_change_link()}
										</Button>
									{/if}
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-xs">
							<!-- What is stored for the day (pay plan 5.3): saved punches with their source. -->
							{#if v.figures}
								{@render record(v.figures)}
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={7} class="h-20 text-center text-muted-foreground">
							{sheet.scope ? m.attendance_nobody_planned() : m.attendance_pick_scope()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</DayTagPopover>

	<div class="flex flex-wrap items-center gap-2 px-4 pb-4">
		{#if available.length > 0}
			<PersonSelect
				options={availablePeople}
				bind:value={addStaffId}
				placeholder={m.attendance_add_person()}
				aria-label={m.attendance_add_person()}
				class="w-64"
			/>
			<Button type="button" variant="outline" disabled={!addStaffId} onclick={addPerson}>
				<PlusIcon data-icon="inline-start" />
				{m.attendance_add_person()}
			</Button>
		{/if}
		<Form.Button class="ms-auto" disabled={$delayed || view.length === 0}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{m.attendance_save()}
		</Form.Button>
	</div>
</form>
