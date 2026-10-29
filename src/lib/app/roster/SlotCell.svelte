<script lang="ts">
	import { SortableKeyboardPlugin } from '@dnd-kit/dom/sortable';
	import { createSortable } from '@dnd-kit/svelte/sortable';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { m } from '#lib/paraglide/messages.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { DropSource } from '#lib/roster/slots.js';
	import { cn } from '#lib/utils.js';
	import { shiftColourClass } from './colours.js';
	import { slotLabel } from './labels.js';

	type Props = Omit<HTMLButtonAttributes, 'id' | 'children'> & {
		/** Stable key of this day; moves with the slot when days are reordered. */
		id: string;
		index: number;
		shift: Pick<RosterShift, 'code' | 'colour' | 'nameEn' | 'nameAr'> | null;
		/** Weekday name (weekly) or day number (cycle). */
		name: string;
		disabled?: boolean;
	};

	let {
		id,
		index,
		shift,
		name,
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();

	// A day is dragged (onto another day, "+ add" or the bin) and takes drops (another day, a shift).
	// Only the keyboard plugin: no optimistic sorting, because the editor applies its own drop rules
	// (swap, insert, move) when the drag ends.
	const sortable = createSortable({
		get id() {
			return id;
		},
		get index() {
			return index;
		},
		type: 'slot',
		accept: ['slot', 'shift'],
		get data() {
			return { kind: 'slot', index } satisfies DropSource;
		},
		get disabled() {
			return disabled;
		},
		plugins: [SortableKeyboardPlugin]
	});
</script>

<button
	{@attach sortable.attach}
	type="button"
	{disabled}
	data-drag-source={sortable.isDragSource}
	data-drop-target={sortable.isDropTarget}
	class={cn(
		'flex size-11 cursor-grab flex-col items-center justify-center rounded-md text-sm font-semibold transition-[color,background-color,opacity] select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:cursor-default disabled:opacity-50 data-[drag-source=true]:opacity-40 data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-ring',
		shift ? shiftColourClass(shift.colour) : 'bg-muted text-muted-foreground',
		className
	)}
	aria-label={m.roster_cycle_cell({ day: name, kind: slotLabel(shift) })}
	{...restProps}
>
	<bdi aria-hidden="true" dir="ltr">{shift?.code ?? m.roster_letter_off()}</bdi>
	<span class="text-[0.625rem] font-normal opacity-80" aria-hidden="true">{name}</span>
</button>
