<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import ShiftChip from '#lib/app/roster/ShiftChip.svelte';
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
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterDay } from '#lib/roster/roster.js';
	import {
		ENTRY_ABSENCES,
		entrySheetSchema,
		type AttendanceMessage
	} from '#lib/schemas/attendance.schema.js';
	import type { EntrySheet } from '#lib/server/services/attendance/attendance.bl.js';
	import type { EventRow } from '#lib/server/services/attendance/attendance.crud.js';
	import { cn } from '#lib/utils.js';
	import { lookupName, personName } from '#lib/utils/locale.js';

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
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') toast.success(form.message.text);
				else if (form.message?.kind === 'error') toast.error(form.message.text);
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, errors, enhance, delayed } = form;

	type ViewRow = {
		person: EntrySheet['rows'][number]['person'];
		day: RosterDay;
		events: EventRow[];
		others: Pair[];
		/** Added with "+ add person": not planned on this shift. */
		added: boolean;
	};

	let view = $state<ViewRow[]>(untrack(() => sheet.rows.map((row) => ({ ...row, added: false }))));
	let available = $state(untrack(() => sheet.others));

	const shiftsById = $derived(new Map(sheet.shifts.map((s) => [s.id, s])));
	const activeShifts = $derived(sheet.shifts.filter((s) => s.active));
	const now = new Date();

	const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

	/** The pair a row would save, and what the checks say about it (`null`: nothing to check yet). */
	function check(index: number) {
		const row = $formData.rows[index];
		const v = view[index];
		const shift = shiftsById.get(row.shiftId);
		if (!shift || row.absence || !CLOCK.test(row.checkIn)) return null;
		if (row.checkOut && !CLOCK.test(row.checkOut)) return null;
		const pair = resolvePair(sheet.shiftDate, shift, row.checkIn, row.checkOut || null);
		const result = validatePair(pair, {
			shiftDate: sheet.shiftDate,
			shift,
			planned: v.day.shiftId === row.shiftId,
			others: [...v.others, ...toPairs(pairsOf(v.events))],
			now
		});
		return { pair, ...result };
	}

	const checks = $derived($formData.rows.map((_, i) => check(i)));

	const nextDay = (at: Date | null | undefined) =>
		at !== null && at !== undefined && calendarDate(at) !== sheet.shiftDate;

	function issuesText(issues: PairIssue[]) {
		return issues.map(pairIssueMessage).join(' ');
	}

	/** Enter moves to the next row's check-in instead of submitting. */
	let checkInRefs = $state<(HTMLInputElement | null)[]>([]);
	function nextRow(event: KeyboardEvent, index: number) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		checkInRefs[index + 1]?.focus();
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
	let addShiftId = $state(untrack(() => sheet.shifts.find((s) => s.active)?.id ?? ''));

	function addPerson() {
		const picked = available.find((o) => o.person.staffId === addStaffId);
		if (!picked || !addShiftId) return;
		view = [...view, { ...picked, events: [], added: true }];
		available = available.filter((o) => o !== picked);
		$formData.rows = [
			...$formData.rows,
			{
				staffId: picked.person.staffId,
				shiftId: addShiftId,
				checkIn: '',
				checkOut: '',
				absence: '',
				reason: ''
			}
		];
		addStaffId = '';
	}

	const selectClass =
		'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

<form method="POST" action="?/save" class="flex flex-col gap-4" use:enhance>
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>{m.attendance_col_person()}</Table.Head>
				<Table.Head>{m.attendance_col_shift()}</Table.Head>
				<Table.Head>{m.attendance_col_in()}</Table.Head>
				<Table.Head>{m.attendance_col_out()}</Table.Head>
				<Table.Head>{m.attendance_col_absence()}</Table.Head>
				<Table.Head>{m.attendance_col_notes()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each view as v, index (v.person.staffId)}
				{const row = $formData.rows[index]}
				{const rowErrors = $errors.rows?.[index]}
				{const result = checks[index]}
				{const existing = pairsOf(v.events)}
				{const shift = shiftsById.get(row.shiftId)}
				<Table.Row class="align-top">
					<Table.Cell>
						<div class="font-medium">{personName(v.person)}</div>
						<bdi class="font-mono text-xs text-muted-foreground" dir="ltr"
							>{v.person.employeeNo}</bdi
						>
					</Table.Cell>
					<Table.Cell class="whitespace-nowrap">
						{#if v.day.source === 'absence'}
							<Badge variant="outline" class="mb-1">{m.roster_preview_absent()}</Badge>
						{/if}
						{#if v.added || !v.day.shiftId}
							<select
								class={selectClass}
								bind:value={$formData.rows[index].shiftId}
								aria-label={m.attendance_col_shift()}
								tabindex={-1}
							>
								{#if !v.added}<option value="">{m.attendance_col_shift()}…</option>{/if}
								{#each activeShifts as option (option.id)}
									<option value={option.id}>{option.code} · {lookupName(option)}</option>
								{/each}
							</select>
						{:else if shift}
							<span class="inline-flex items-center gap-2">
								<ShiftChip {shift} />
								<bdi class="text-sm text-muted-foreground" dir="ltr">
									{shift.startTime.slice(0, 5)} → {shift.endTime.slice(0, 5)}
								</bdi>
							</span>
						{/if}
						{#if existing.length > 0}
							<ul class="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
								{#each existing as pair, p (p)}
									<li>
										<bdi dir="ltr">
											{pair.checkIn ? clockOf(pair.checkIn.occurredAt) : '—'} →
											{pair.checkOut ? clockOf(pair.checkOut.occurredAt) : '…'}
											{#if nextDay(pair.checkOut?.occurredAt)}+1{/if}
										</bdi>
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
					</Table.Cell>
					<Table.Cell>
						<div class="flex items-center gap-1">
							<Input
								bind:ref={checkInRefs[index]}
								bind:value={$formData.rows[index].checkIn}
								onblur={() =>
									($formData.rows[index].checkIn = normalizeClock($formData.rows[index].checkIn))}
								onkeydown={(event) => nextRow(event, index)}
								class="w-20 font-mono"
								dir="ltr"
								inputmode="numeric"
								placeholder="HH:mm"
								autocomplete="off"
								disabled={row.absence !== ''}
								aria-label={m.attendance_in_for({ name: personName(v.person) })}
								aria-invalid={rowErrors?.checkIn ? true : undefined}
							/>
							{#if nextDay(result?.pair.checkIn)}
								<Badge variant="secondary">{m.attendance_next_day()}</Badge>
							{/if}
						</div>
					</Table.Cell>
					<Table.Cell>
						<div class="flex items-center gap-1">
							<Input
								bind:value={$formData.rows[index].checkOut}
								onblur={() =>
									($formData.rows[index].checkOut = normalizeClock($formData.rows[index].checkOut))}
								onkeydown={(event) => nextRow(event, index)}
								class="w-20 font-mono"
								dir="ltr"
								inputmode="numeric"
								placeholder="HH:mm"
								autocomplete="off"
								disabled={row.absence !== ''}
								aria-label={m.attendance_out_for({ name: personName(v.person) })}
								aria-invalid={rowErrors?.checkOut ? true : undefined}
							/>
							{#if nextDay(result?.pair.checkOut)}
								<Badge variant="secondary">{m.attendance_next_day()}</Badge>
							{/if}
						</div>
					</Table.Cell>
					<Table.Cell>
						<div class="flex gap-1" role="group" aria-label={m.attendance_col_absence()}>
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
					</Table.Cell>
					<Table.Cell class="min-w-56">
						{#if v.added || !v.day.shiftId || row.absence || rowErrors?.reason}
							<Input
								bind:value={$formData.rows[index].reason}
								class="h-8"
								placeholder={v.added || !v.day.shiftId
									? m.attendance_reason_required()
									: m.attendance_reason_optional()}
								aria-label={m.roster_field_reason()}
								aria-invalid={rowErrors?.reason ? true : undefined}
							/>
						{/if}
						{#if result && result.errors.length > 0}
							<p class="mt-1 text-xs text-destructive">{issuesText(result.errors)}</p>
						{/if}
						{#if result && result.warnings.length > 0}
							<p class="mt-1 text-xs text-amber-700 dark:text-amber-400">
								{issuesText(result.warnings)}
							</p>
						{/if}
						{#each [rowErrors?.staffId, rowErrors?.shiftId, rowErrors?.checkIn, rowErrors?.checkOut, rowErrors?.absence, rowErrors?.reason] as list, e (e)}
							{#if list}
								<p class="mt-1 text-xs text-destructive">{list.join(' ')}</p>
							{/if}
						{/each}
					</Table.Cell>
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={6} class="h-20 text-center text-muted-foreground">
						{sheet.scope ? m.attendance_nobody_planned() : m.attendance_pick_scope()}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<div class="flex flex-wrap items-center gap-2 px-4 pb-4">
		{#if available.length > 0}
			<select class={selectClass} bind:value={addStaffId} aria-label={m.attendance_add_person()}>
				<option value="">{m.attendance_add_person()}…</option>
				{#each available as other (other.person.staffId)}
					<option value={other.person.staffId}>
						{personName(other.person)} · {other.person.employeeNo}
					</option>
				{/each}
			</select>
			<select class={selectClass} bind:value={addShiftId} aria-label={m.attendance_col_shift()}>
				{#each activeShifts as option (option.id)}
					<option value={option.id}>{option.code} · {lookupName(option)}</option>
				{/each}
			</select>
			<Button type="button" variant="outline" disabled={!addStaffId} onclick={addPerson}>
				<PlusIcon data-icon="inline-start" />
				{m.attendance_add_person()}
			</Button>
		{/if}
		<Button type="submit" class={cn('ms-auto')} disabled={$delayed || view.length === 0}>
			{#if $delayed}
				<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			{m.attendance_save()}
		</Button>
	</div>
</form>
