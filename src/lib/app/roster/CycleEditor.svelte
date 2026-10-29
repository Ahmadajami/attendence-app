<script lang="ts">
	import { PointerActivationConstraints, type DragEndEvent } from '@dnd-kit/dom';
	import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor } from '@dnd-kit/svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { toast } from 'svelte-sonner';
	import { DateFormatter } from '@internationalized/date';
	import MinusIcon from 'phosphor-svelte/lib/MinusIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { MAX_CYCLE_DAYS } from '#lib/roster/rules.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import {
		appendSlot,
		applyDrop,
		setSlot,
		type DropRefusal,
		type DropResult,
		type DropSource,
		type DropTarget
	} from '#lib/roster/slots.js';
	import type { PatternType } from '#lib/schemas/enums.js';
	import { cn } from '#lib/utils.js';
	import DropZone from './DropZone.svelte';
	import PaletteChip from './PaletteChip.svelte';
	import ShiftChip from './ShiftChip.svelte';
	import SlotCell from './SlotCell.svelte';
	import { shiftsById } from './labels.js';

	type PaletteShift = Pick<
		RosterShift,
		'id' | 'code' | 'nameEn' | 'nameAr' | 'colour' | 'startTime' | 'endTime' | 'active'
	>;

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** One shift id per slot (`null`: off); slot 0 first. */
		value: (string | null)[];
		type: PatternType;
		/** Every shift: active ones form the palette, inactive ones still show in saved slots. */
		shifts: PaletteShift[];
		disabled?: boolean;
	};

	let {
		value = $bindable(),
		type,
		shifts,
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();

	const uid = $props.id();
	const byId = $derived(shiftsById(shifts));
	const palette = $derived(shifts.filter((s) => s.active));
	const shiftOf = (id: string | null) => (id === null ? null : (byId.get(id) ?? null));

	/** The chip picked last (`null`: off); `undefined` until one is picked. */
	let picked = $state<string | null | undefined>();
	/**
	 * What a tap paints: the picked shift while it is still in the palette, otherwise the first
	 * palette shift (`null`: off). The chip highlight reads the same value, so they can't drift.
	 */
	const brush = $derived(
		picked === null
			? null
			: picked !== undefined && palette.some((s) => s.id === picked)
				? picked
				: (palette[0]?.id ?? null)
	);

	// Each day has a key that moves with it, so a reordered day keeps its cell (UI rules: key by
	// identity, not index). Days added from outside (copy from, type switch) get placeholder keys
	// until the next edit here replaces them.
	let nextKey = 0;
	const newKey = () => `${uid}-${nextKey++}`;
	const placeholder = `${uid}-x`;
	let keys = $state<string[]>([]);
	const cells = $derived(
		value.map((slot, index) => ({ key: keys[index] ?? `${placeholder}${index}`, slot, index }))
	);

	/** One assignment per edit, so the form taints once. */
	function commit(slots: (string | null)[], nextKeys: readonly string[]) {
		keys = nextKeys.map((k) => (k.startsWith(placeholder) ? newKey() : k));
		value = slots;
	}

	const sameSlots = (a: readonly (string | null)[], b: readonly (string | null)[]) =>
		a.length === b.length && a.every((s, i) => s === b[i]);

	const refusalText = (refused: DropRefusal) =>
		refused === 'full' ? m.roster_drop_full({ max: MAX_CYCLE_DAYS }) : m.roster_drop_last_day();

	/** Applies a slot edit and the same edit to the keys; a new day gets a new key. */
	function apply(result: DropResult, keyed: () => readonly string[]) {
		if (result.refused) {
			toast.error(refusalText(result.refused));
			return;
		}
		if (!sameSlots(result.slots, value)) commit(result.slots, keyed());
	}

	const currentKeys = () => cells.map((c) => c.key);

	function drop(source: DropSource, target: DropTarget) {
		// A dragged shift also becomes the brush (mockup F2).
		if (source.kind === 'shift') picked = source.shiftId;
		apply(applyDrop(value, type, source, target), () =>
			source.kind === 'shift' && type === 'weekly'
				? currentKeys()
				: (applyDrop(
						currentKeys(),
						type,
						source.kind === 'shift' ? { kind: 'shift', shiftId: newKey() } : source,
						target
					).slots as string[])
		);
	}

	function onDragEnd(event: DragEndEvent) {
		const { source, target } = event.operation;
		if (event.canceled || !source?.data || !target?.data) return;
		drop(source.data as DropSource, target.data as DropTarget);
	}

	const paint = (index: number, slot: string | null) =>
		apply({ slots: setSlot(value, index, slot) }, currentKeys);

	/** Typing a one-letter shift code sets that shift; `-` sets off. Enter paints (a click). */
	function keydown(event: KeyboardEvent, index: number) {
		if (event.key === '-') {
			event.preventDefault();
			paint(index, null);
			return;
		}
		const match = palette.find((s) => s.code.toLowerCase() === event.key.toLowerCase());
		if (!match) return;
		event.preventDefault();
		paint(index, match.id);
	}

	function resize(length: number) {
		if (length < 1 || length > MAX_CYCLE_DAYS) return;
		const current = currentKeys();
		if (length < value.length) commit(value.slice(0, length), current.slice(0, length));
		else
			commit(
				[...value, ...Array<string | null>(length - value.length).fill(null)],
				[...current, ...Array.from({ length: length - value.length }, newKey)]
			);
	}

	const append = () => apply(appendSlot(value, brush), () => [...currentKeys(), newKey()]);

	// Mouse/pen: a drag starts after 4 px, so a click still paints. Touch: after a 200 ms press, so a
	// tap paints and a swipe scrolls. Keyboard: Space lifts (Enter stays a paint), arrows move, Space
	// drops, Escape cancels.
	const sensors = [
		PointerSensor.configure({
			activationConstraints: (event) =>
				event.pointerType === 'touch'
					? [new PointerActivationConstraints.Delay({ value: 200, tolerance: 5 })]
					: [new PointerActivationConstraints.Distance({ value: 4 })]
		}),
		KeyboardSensor.configure({
			keyboardCodes: { ...KeyboardSensor.defaults.keyboardCodes, start: ['Space'] }
		})
	];

	/** Weekday names, Sunday first (2026-01-04 is a Sunday). */
	const weekdays = $derived.by(() => {
		const format = new DateFormatter(getLocale(), { weekday: 'short', timeZone: 'UTC' });
		return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2026, 0, 4 + i))));
	});

	const cellName = (index: number) => (type === 'weekly' ? weekdays[index] : String(index + 1));
</script>

<DragDropProvider {sensors} {onDragEnd}>
	<div class={cn('flex flex-col gap-3', className)} {...restProps}>
		<span id="{uid}-shift-help" class="sr-only">{m.roster_drag_shift()}</span>
		<span id="{uid}-day-help" class="sr-only">{m.roster_drag_day()}</span>

		<div
			class="flex flex-wrap items-center gap-2"
			role="radiogroup"
			aria-label={m.roster_palette()}
		>
			{#each palette as shift (shift.id)}
				<PaletteChip
					{shift}
					selected={brush === shift.id}
					{disabled}
					aria-describedby="{uid}-shift-help"
					onclick={() => (picked = shift.id)}
				/>
			{/each}
			<PaletteChip
				shift={null}
				selected={brush === null}
				{disabled}
				aria-describedby="{uid}-shift-help"
				onclick={() => (picked = null)}
			/>
		</div>

		<div class="flex flex-wrap gap-1.5" role="group" aria-label={m.roster_cycle_cells()}>
			{#each cells as cell (cell.key)}
				<SlotCell
					id={cell.key}
					index={cell.index}
					shift={shiftOf(cell.slot)}
					name={cellName(cell.index)}
					{disabled}
					aria-describedby="{uid}-day-help"
					onclick={() => paint(cell.index, brush)}
					onkeydown={(event) => keydown(event, cell.index)}
				/>
			{/each}
			{#if type === 'cycle'}
				<DropZone id="{uid}-end" accept={['shift', 'slot']} target={{ kind: 'end' }} {disabled}>
					{#snippet children({ attach, active })}
						{const shift = $derived(shiftOf(brush))}
						<button
							{@attach attach}
							type="button"
							{disabled}
							aria-label={m.roster_drop_add()}
							title={m.roster_drop_add()}
							class={cn(
								'flex size-11 flex-col items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
								active && 'ring-2 ring-ring'
							)}
							onclick={append}
						>
							<PlusIcon class="size-4" aria-hidden="true" />
							<bdi class="font-mono text-[0.625rem]" aria-hidden="true" dir="ltr">
								{shift?.code ?? m.roster_letter_off()}
							</bdi>
						</button>
					{/snippet}
				</DropZone>
			{/if}
		</div>

		{#if type === 'cycle'}
			<DropZone id="{uid}-bin" accept={['slot']} target={{ kind: 'bin' }} {disabled}>
				{#snippet children({ attach, active })}
					<div
						{@attach attach}
						class={cn(
							'flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors',
							active && 'bg-destructive/10 text-destructive ring-2 ring-ring'
						)}
					>
						<TrashIcon class="size-4" aria-hidden="true" />
						{m.roster_drop_bin()}
					</div>
				{/snippet}
			</DropZone>
		{/if}

		<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			{#if type === 'cycle'}
				<Button
					type="button"
					variant="outline"
					size="icon"
					{disabled}
					aria-label={m.roster_cycle_remove_day()}
					onclick={() => resize(value.length - 1)}
				>
					<MinusIcon />
				</Button>
				<span>{m.roster_cycle_length({ days: value.length, max: MAX_CYCLE_DAYS })}</span>
				<Button
					type="button"
					variant="outline"
					size="icon"
					{disabled}
					aria-label={m.roster_cycle_add_day()}
					onclick={() => resize(value.length + 1)}
				>
					<PlusIcon />
				</Button>
			{/if}
			<span class="ms-auto">
				{type === 'weekly' ? m.roster_cycle_hint_weekly() : m.roster_cycle_hint_cycle()}
			</span>
		</div>
	</div>

	<!-- No drop animation: a dropped shift would fly back to the palette as if refused. -->
	<DragOverlay dropAnimation={null}>
		{#snippet children(source)}
			{const data = $derived(source.data as DropSource)}
			<ShiftChip
				shift={shiftOf(data.kind === 'shift' ? data.shiftId : (value[data.index] ?? null))}
				class="shadow-lg"
			/>
		{/snippet}
	</DragOverlay>
</DragDropProvider>
