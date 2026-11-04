<script lang="ts">
	import { SWAP_STATE_LABEL } from '#lib/roster/swap-labels.js';
	import type { SwapState } from '#lib/schemas/enums.js';

	// A swap request's state as a tinted tag (the day tags' style): pending amber, approved green,
	// rejected red, cancelled grey.

	let { state }: { state: SwapState } = $props();

	const TONE: Record<SwapState, string> = {
		pending: 'border-warning/30 bg-warning/10 text-warning',
		approved: 'border-success/30 bg-success/10 text-success',
		rejected: 'border-problem/30 bg-problem/10 text-problem',
		cancelled: 'border-border bg-muted text-muted-foreground'
	};
</script>

<span
	class={[
		'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium',
		TONE[state]
	]}
>
	{SWAP_STATE_LABEL[state]()}
</span>
