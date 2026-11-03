<script lang="ts">
	import { untrack } from 'svelte';
	import { fieldProxy, superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { missionCancelSchema, type PatternPayMessage } from '#lib/schemas/pattern-pay.schema.js';
	import type { PatternMission } from '#lib/server/services/pattern-pay/pattern-pay.bl.js';
	import { statusToasts } from '#lib/utils/form-toasts.js';
	import { endSide, personName } from '#lib/utils/locale.js';
	import { formatDateRange } from './pay-labels.js';

	type Props = {
		data: SuperValidated<Infer<typeof missionCancelSchema>, PatternPayMessage>;
		/** The mission; `null` while the sheet is closed. */
		mission: PatternMission | null;
		/** One member to cancel for; `''`: the whole mission. */
		staffId: string;
		open: boolean;
	};

	let { data, mission, staffId, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(missionCancelSchema),
			// Several forms share the pattern page: the load data wins after a save.
			invalidateAll: 'pessimistic',
			...statusToasts(() => (open = false))
		}
	);
	const { form: formData, enhance, delayed } = form;

	// Filled when the sheet opens for a mission: not user edits, so they don't taint the form.
	const groupId = fieldProxy(form, 'groupId', { taint: false });
	const memberId = fieldProxy(form, 'staffId', { taint: false });
	const reason = fieldProxy(form, 'reason', { taint: false });

	$effect(() => {
		if (!open || !mission) return;
		const id = mission.groupId;
		const member = staffId;
		untrack(() => {
			groupId.set(id);
			memberId.set(member);
			reason.set('');
		});
	});

	/** The members this cancels: one, or every active one. */
	const names = $derived(
		(mission?.members ?? [])
			.filter((p) => !p.cancelled && (!staffId || p.staffId === staffId))
			.map(personName)
			.join(m.list_separator())
	);
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()}>
		<Sheet.Header>
			<Sheet.Title>
				{staffId ? m.pattern_mission_cancel_member_title() : m.pattern_mission_cancel_title()}
			</Sheet.Title>
			<Sheet.Description>
				{mission
					? m.pattern_mission_cancel_description({
							names,
							dates: formatDateRange(mission.startsOn, mission.endsOn)
						})
					: ''}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/cancelMission" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="groupId" value={$formData.groupId} />
			<input type="hidden" name="staffId" value={$formData.staffId} />

			<Form.Field {form} name="reason">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.roster_field_reason()}</Form.Label>
						<Textarea {...props} bind:value={$formData.reason} rows={2} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button variant="destructive" class="self-start" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{m.pattern_mission_cancel_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
