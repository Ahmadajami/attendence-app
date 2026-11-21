<script lang="ts">
	import { deserialize } from '$app/forms';
	import { untrack } from 'svelte';
	import { fieldProxy, superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { dayKey } from '#lib/attendance/recompute.js';
	import { absenceLabel } from '#lib/attendance/labels.js';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { AttendanceMessage } from '#lib/schemas/attendance.schema.js';
	import {
		BULK_DAY_STATES,
		bulkDayStateSchema,
		type BulkDayReview,
		type BulkDayStateInput,
		type BulkDayTarget
	} from '#lib/schemas/bulk-day-state.schema.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { personName } from '#lib/utils/locale.js';

	type Props = {
		data: SuperValidated<BulkDayStateInput, AttendanceMessage>;
		targets: BulkDayTarget[];
		pageHref: string;
		open: boolean;
		onRemove: (target: BulkDayTarget) => void;
		onSaved: () => void;
	};

	let { data, targets, pageHref, open = $bindable(), onRemove, onSaved }: Props = $props();
	let reviewed = $state<{ key: string; result: BulkDayReview } | null>(null);
	let reviewError = $state('');
	let reviewing = $state(false);
	let reviewRequest: AbortController | undefined;

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(bulkDayStateSchema),
			dataType: 'json',
			// The single-day editors and the bulk form share the Daily page.
			invalidateAll: 'pessimistic',
			onSubmit({ cancel, jsonData }) {
				if (!review?.changes || review.blocked) {
					cancel();
					return;
				}
				jsonData({ ...$formData, targets, version: review.version });
			},
			onResult({ result }) {
				if (result.type === 'failure' && result.status === 409) reviewed = null;
			},
			...statusToasts(() => {
				open = false;
				onSaved();
			})
		}
	);
	const { form: formData, enhance, delayed } = form;
	const formTargets = fieldProxy(form, 'targets', { taint: false });
	const reviewKey = $derived(
		JSON.stringify([pageHref, targets, $formData.operation, $formData.reason.trim()])
	);
	const review = $derived(reviewed?.key === reviewKey ? reviewed.result : null);
	const stateOptions = $derived(
		BULK_DAY_STATES.map((value) => ({
			value,
			label: value === 'clear' ? m.daily_bulk_clear_state() : absenceLabel(value)
		}))
	);
	const outcomeMessage = {
		pattern: m.daily_bulk_pattern,
		owned: m.daily_bulk_owned,
		unavailable: m.daily_bulk_unavailable
	};

	async function requestReview() {
		reviewed = null;
		reviewError = '';
		$formTargets = targets;
		const key = reviewKey;
		const request = new AbortController();
		reviewRequest = request;
		reviewing = true;
		try {
			const validation = await form.validateForm({ update: true, focusOnError: true });
			if (!validation.valid || request.signal.aborted || key !== reviewKey) return;
			const payload = new FormData();
			payload.set('payload', JSON.stringify(validation.data));
			const response = await fetch(`${pageHref}&/reviewBulkState`, {
				method: 'POST',
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				body: payload,
				signal: request.signal
			});
			const result = deserialize<{ review: BulkDayReview }, { notice: string }>(
				await response.text()
			);
			if (!open || request.signal.aborted || key !== reviewKey) return;
			if (result.type === 'success' && result.data) reviewed = { key, result: result.data.review };
			else
				reviewError =
					result.type === 'failure' && result.data?.notice
						? result.data.notice
						: m.daily_bulk_review_failed();
		} catch {
			if (!request.signal.aborted && open) reviewError = m.daily_bulk_review_failed();
		} finally {
			if (reviewRequest === request) reviewing = false;
		}
	}

	function onOpenChange() {
		reviewRequest?.abort();
		reviewed = null;
		reviewError = '';
		form.reset();
	}
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Trigger type="button" class={buttonVariants({ size: 'sm' })} disabled={!targets.length}>
		{m.daily_bulk_change_state()}
	</Dialog.Trigger>
	<Dialog.Content showCloseButton={false} class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{m.daily_bulk_change_state()}</Dialog.Title>
			<Dialog.Description>{m.daily_bulk_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action={`${pageHref}&/applyBulkState`}
			class="flex flex-col gap-4"
			use:enhance
		>
			<Form.Field {form} name="operation">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.day_state_field_state()}</Form.Label>
						<Select.Root
							type="single"
							name={props.name}
							items={stateOptions}
							bind:value={$formData.operation}
							disabled={$delayed}
						>
							<Select.Trigger {...props} class="w-full">
								<Select.Value placeholder={m.day_state_pick_state()} />
							</Select.Trigger>
							<Select.Content>
								{#each stateOptions as option (option.value)}
									<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item
									>
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="reason">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_reason()}</Form.Label>
						<Textarea {...props} bind:value={$formData.reason} rows={2} disabled={$delayed} />
					{/snippet}
				</Form.Control>
				<Form.Description>
					{$formData.operation === 'clear'
						? m.daily_bulk_clear_reason()
						: m.day_state_reason_hint()}
				</Form.Description>
				<Form.FieldErrors />
			</Form.Field>

			{#if reviewError}
				<p role="alert" class="text-sm text-destructive">{reviewError}</p>
			{/if}
			{#if review}
				<Separator />
				<p role="status" class="text-sm font-medium">{m.daily_bulk_review_summary(review)}</p>
				<ul class="flex max-h-64 flex-col gap-2 overflow-y-auto">
					{#each review.rows as row (dayKey(row.staffId, row.shiftDate))}
						{const name = $derived(personName(row.person))}
						{const date = $derived(formatCalendarDate(row.shiftDate))}
						<li class="flex items-start justify-between gap-4 py-2 text-sm">
							<div class="flex min-w-0 flex-col gap-1">
								<p class="font-medium"><bdi>{name}</bdi> · <bdi>{date}</bdi></p>
								<p>
									{m.daily_bulk_state_change({
										current: row.current ? absenceLabel(row.current) : m.daily_bulk_no_state(),
										proposed: row.proposed ? absenceLabel(row.proposed) : m.daily_bulk_no_state()
									})}
									· {row.hasPunches ? m.daily_bulk_has_punches() : m.daily_bulk_no_punches()}
								</p>
								{#if row.outcome === 'unchanged'}
									<p class="text-muted-foreground">{m.daily_bulk_unchanged()}</p>
								{:else if row.outcome !== 'change'}
									<p class="text-destructive">{outcomeMessage[row.outcome]()}</p>
								{/if}
							</div>
							{#if row.outcome !== 'change' && row.outcome !== 'unchanged'}
								<Button
									type="button"
									variant="outline"
									size="sm"
									aria-label={m.daily_bulk_remove({ name, date })}
									onclick={() => onRemove(row)}
								>
									{m.daily_bulk_remove_row()}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			<Dialog.Footer>
				<Dialog.Close type="button" class={buttonVariants({ variant: 'outline' })}>
					{m.attendance_cancel()}
				</Dialog.Close>
				<Button
					type="button"
					variant={review ? 'outline' : 'default'}
					disabled={!targets.length || reviewing || $delayed}
					onclick={requestReview}
				>
					{#if reviewing}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					{m.daily_bulk_review()}
				</Button>
				<Form.Button disabled={!review?.changes || !!review.blocked || $delayed}>
					{#if $delayed}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					{m.daily_bulk_apply()}
				</Form.Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
