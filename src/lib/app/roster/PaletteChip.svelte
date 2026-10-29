<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { DropSource } from '#lib/roster/slots.js';
	import { cn } from '#lib/utils.js';
	import ShiftChip from './ShiftChip.svelte';
	import { slotLabel } from './labels.js';

	type Props = Omit<HTMLButtonAttributes, 'children'> & {
		/** `null`: the off chip. */
		shift: Pick<RosterShift, 'id' | 'code' | 'colour' | 'nameEn' | 'nameAr'> | null;
		/** The current brush. */
		selected: boolean;
		disabled?: boolean;
	};

	let { shift, selected, disabled = false, class: className, ...restProps }: Props = $props();

	// The palette is a radio group: dnd-kit writes `aria-pressed` on draggables, so the selection
	// is `aria-checked`.
	const draggable = createDraggable({
		get id() {
			return `shift:${shift?.id ?? 'off'}`;
		},
		type: 'shift',
		get data() {
			return { kind: 'shift', shiftId: shift?.id ?? null } satisfies DropSource;
		},
		get disabled() {
			return disabled;
		}
	});
</script>

<button
	{@attach draggable.attach}
	type="button"
	role="radio"
	aria-checked={selected}
	{disabled}
	title={slotLabel(shift)}
	data-drag-source={draggable.isDragSource}
	class={cn(
		'cursor-grab rounded-md p-0.5 ring-offset-background transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:cursor-default disabled:opacity-50 data-[drag-source=true]:opacity-40',
		selected && 'ring-2 ring-ring ring-offset-2',
		className
	)}
	{...restProps}
>
	<ShiftChip {shift} />
</button>
