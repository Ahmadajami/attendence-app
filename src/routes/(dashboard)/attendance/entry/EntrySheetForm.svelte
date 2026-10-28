<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
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
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
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
	import { statusToasts } from '#lib/utils/form-toasts.js';
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
			...statusToasts()
		}
	);
	const { form: formData, enhance, delayed } = form;

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

	const shiftLabel = (id: string) => {
		const shift = shiftsById.get(id);
		return shift ? `${shift.code} · ${lookupName(shift)}` : m.attendance_pick_shift();
	};

	let addStaffId = $state('');
	let addShiftId = $state(untrack(() => sheet.shifts.find((s) => s.active)?.id ?? ''));
	const addPersonLabel = $derived.by(() => {
		const picked = available.find((o) => o.person.staffId === addStaffId);
		return picked ? personName(picked.person) : m.attendance_add_person();
	});

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
				{const result = checks[index]}
				{const existing = pairsOf(v.events)}
				{const planned = shiftsById.get(v.day.shiftId ?? '')}
				{const name = personName(v.person)}
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
								<Badge variant="outline">{m.roster_preview_absent()}</Badge>
							{/if}
							{#if v.added || !planned}
								<Form.Field {form} name={`rows[${index}].shiftId`}>
									<Form.Control>
										{#snippet children({ props })}
											<Form.Label class="sr-only">
												{m.attendance_shift_for({ name })}
											</Form.Label>
											<Select.Root
												type="single"
												value={$formData.rows[index].shiftId}
												onValueChange={(value) => ($formData.rows[index].shiftId = value)}
											>
												<Select.Trigger {...props} class="w-44" tabindex={-1}>
													{shiftLabel($formData.rows[index].shiftId)}
												</Select.Trigger>
												<Select.Content>
													{#each activeShifts as option (option.id)}
														<Select.Item value={option.id} label={shiftLabel(option.id)} />
													{/each}
												</Select.Content>
											</Select.Root>
										{/snippet}
									</Form.Control>
									<Form.FieldErrors />
								</Form.Field>
							{:else}
								<span class="inline-flex items-center gap-2">
									<ShiftChip shift={planned} />
									<bdi class="text-sm text-muted-foreground" dir="ltr">
										{planned.startTime.slice(0, 5)} → {planned.endTime.slice(0, 5)}
									</bdi>
								</span>
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
							{#if v.added || !planned || row.absence}
								<Form.Field {form} name={`rows[${index}].reason`}>
									<Form.Control>
										{#snippet children({ props })}
											<Form.Label class="sr-only">{m.attendance_reason_for({ name })}</Form.Label>
											<Input
												{...props}
												bind:value={$formData.rows[index].reason}
												class="h-8"
												placeholder={row.absence
													? m.attendance_reason_optional()
													: m.attendance_reason_required()}
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
							{/if}
						</div>
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
			<Select.Root type="single" bind:value={addStaffId}>
				<Select.Trigger class="w-64" aria-label={m.attendance_add_person()}>
					{addPersonLabel}
				</Select.Trigger>
				<Select.Content>
					{#each available as other (other.person.staffId)}
						<Select.Item
							value={other.person.staffId}
							label={`${personName(other.person)} · ${other.person.employeeNo}`}
						/>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={addShiftId}>
				<Select.Trigger class="w-44" aria-label={m.attendance_col_shift()}>
					{shiftLabel(addShiftId)}
				</Select.Trigger>
				<Select.Content>
					{#each activeShifts as option (option.id)}
						<Select.Item value={option.id} label={shiftLabel(option.id)} />
					{/each}
				</Select.Content>
			</Select.Root>
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
