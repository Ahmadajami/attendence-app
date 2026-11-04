<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import { SWAP_KIND_LABEL, SWAP_SCOPE_LABEL, SWAP_STATE_LABEL } from '#lib/roster/swap-labels.js';
	import type { SwapDetail } from '#lib/server/services/swaps/swaps.bl.js';
	import { formatDateTime } from '#lib/utils/datetime.js';
	import { endSide, personName } from '#lib/utils/locale.js';
	import SwapCancelForm from './SwapCancelForm.svelte';
	import SwapDecisionForm from './SwapDecisionForm.svelte';
	import SwapEffect from './SwapEffect.svelte';
	import SwapStateBadge from './SwapStateBadge.svelte';

	// One swap request (swaps plan SW1, SW4, SW5, SW8): what it does to each day, who asked, who
	// decided or cancelled and why, and the actions its state allows (`roster.manage`). Opened by
	// `?swap=<id>`, so the History's cause link lands here.

	type Props = {
		/** `null` while closed, or when the asked request does not exist (`missing`). */
		detail: SwapDetail | null;
		missing: boolean;
		shifts: ReadonlyMap<string, Pick<RosterShift, 'code' | 'colour'>>;
		canManage: boolean;
		open: boolean;
	};

	let { detail, missing, shifts, canManage, open = $bindable() }: Props = $props();

	type Mode = 'approve' | 'reject' | 'cancel' | null;
	/** The open action; none again for each request loaded (also after a save reloads it). */
	let mode = $derived.by<Mode>(() => {
		void detail;
		return null;
	});

	const nameOf = (who: { fullName: string; fullNameAr: string | null } | null) =>
		who ? personName(who) : m.swap_someone();
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="w-full overflow-y-auto sm:max-w-xl">
		<Sheet.Header>
			<Sheet.Title>{m.swap_detail_title()}</Sheet.Title>
			<Sheet.Description>
				{#if detail}
					<span class="inline-flex flex-wrap items-center gap-2">
						{SWAP_KIND_LABEL[detail.swap.kind]()} · {SWAP_SCOPE_LABEL[detail.swap.scope]()}
						<SwapStateBadge state={detail.swap.state} />
					</span>
				{:else if missing}
					{m.swap_detail_missing()}
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		{#if detail}
			{const swap = $derived(detail.swap)}
			<div class="flex flex-col gap-4 px-4 pb-4">
				<section class="flex flex-col gap-2">
					<h3 class="text-sm font-medium">
						{detail.applied ? m.swap_detail_applied() : m.swap_detail_would()}
					</h3>
					{#if detail.moves.length === 0 && swap.state !== 'pending'}
						<p class="text-sm text-muted-foreground">{m.swap_detail_none()}</p>
					{:else}
						<SwapEffect effect={detail} {shifts} scope={swap.scope} applied={detail.applied} />
					{/if}
				</section>

				<Separator />

				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
					{#if swap.payAsOt}
						<dt class="text-muted-foreground">{m.swaps_pay_as_ot()}</dt>
						<dd>✓</dd>
					{/if}
					<dt class="text-muted-foreground">{m.swap_detail_reason()}</dt>
					<dd class="whitespace-pre-line">{swap.reason}</dd>
					<dt class="text-muted-foreground">{m.swaps_col_requested()}</dt>
					<dd>
						{m.swap_detail_requested({ name: nameOf(swap.requestedBy) })} ·
						<bdi>{formatDateTime(swap.createdAt)}</bdi>
					</dd>
					{#if swap.decidedAt}
						<dt class="text-muted-foreground">
							{SWAP_STATE_LABEL[swap.state === 'rejected' ? 'rejected' : 'approved']()}
						</dt>
						<dd>
							{m.swap_detail_decided({ name: nameOf(swap.decidedBy) })} ·
							<bdi>{formatDateTime(swap.decidedAt)}</bdi>
						</dd>
						{#if swap.decisionNote}
							<dt class="text-muted-foreground">{m.swap_detail_note()}</dt>
							<dd class="whitespace-pre-line">{swap.decisionNote}</dd>
						{/if}
					{/if}
					{#if swap.cancelledAt}
						<dt class="text-muted-foreground">{SWAP_STATE_LABEL.cancelled()}</dt>
						<dd>
							{m.swap_detail_cancelled({ name: nameOf(swap.cancelledBy) })} ·
							<bdi>{formatDateTime(swap.cancelledAt)}</bdi>
						</dd>
						{#if swap.cancelReason}
							<dt class="text-muted-foreground">{m.swap_detail_cancel_reason()}</dt>
							<dd class="whitespace-pre-line">{swap.cancelReason}</dd>
						{/if}
					{/if}
				</dl>

				{#if canManage && (swap.state === 'pending' || swap.state === 'approved')}
					<Separator />
					<div class="flex flex-wrap gap-2">
						{#if swap.state === 'pending'}
							<Button
								variant={mode === 'approve' ? 'default' : 'outline'}
								size="sm"
								onclick={() => (mode = 'approve')}
							>
								{m.swap_approve()}
							</Button>
							<Button
								variant={mode === 'reject' ? 'default' : 'outline'}
								size="sm"
								onclick={() => (mode = 'reject')}
							>
								{m.swap_reject()}
							</Button>
						{/if}
						<Button
							variant={mode === 'cancel' ? 'default' : 'outline'}
							size="sm"
							onclick={() => (mode = 'cancel')}
						>
							{swap.state === 'approved' ? m.swap_cancel() : m.swap_withdraw()}
						</Button>
					</div>

					{#key `${swap.id}:${mode}`}
						{#if mode === 'approve' || mode === 'reject'}
							<SwapDecisionForm
								id={swap.id}
								decision={mode}
								action="?/decideSwap"
								onSaved={() => (mode = null)}
							/>
						{:else if mode === 'cancel'}
							<SwapCancelForm
								id={swap.id}
								applied={swap.state === 'approved'}
								action="?/cancelSwap"
								onSaved={() => (mode = null)}
							/>
						{/if}
					{/key}
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
