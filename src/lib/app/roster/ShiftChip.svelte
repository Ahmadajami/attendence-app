<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import { cn } from '#lib/utils.js';
	import { shiftColourClass } from './colours.js';

	type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
		/** `null`: the off day. */
		shift: Pick<RosterShift, 'code' | 'colour'> | null;
	};

	let { shift, class: className, ...restProps }: Props = $props();
</script>

<!-- A shift's code on its palette colour (theme tokens, light and dark). -->
<span
	class={cn(
		'inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold',
		shift ? shiftColourClass(shift.colour) : 'bg-muted text-muted-foreground',
		className
	)}
	{...restProps}
>
	<bdi dir="ltr">{shift?.code ?? m.roster_letter_off()}</bdi>
</span>
