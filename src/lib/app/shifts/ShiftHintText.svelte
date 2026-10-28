<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { ShiftHint } from './hint.js';
	import { formatDuration } from './labels.js';

	type Props = { hint: ShiftHint };

	let { hint }: Props = $props();
</script>

<!-- "Ends next day · 12 h (720 min) · required 690 min · night" -->
<span class={hint.endsNextDay ? 'font-medium text-foreground' : undefined}>
	{hint.endsNextDay ? m.shifts_hint_next_day() : m.shifts_hint_same_day()}
</span>
· {formatDuration(hint.spanMinutes)} ({m.shifts_minutes({ count: hint.spanMinutes })}) · {m.shifts_hint_required(
	{ minutes: hint.requiredMinutes }
)}
{#if hint.night}· 🌙 {m.shifts_hint_night()}{/if}
