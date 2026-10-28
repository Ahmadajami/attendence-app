<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import MinusIcon from 'phosphor-svelte/lib/MinusIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { MAX_CYCLE_DAYS } from '#lib/roster/rules.js';
	import { SHIFT_KINDS, type ShiftKind } from '#lib/schemas/enums.js';
	import { cn } from '#lib/utils.js';
	import { shiftKindLabel, shiftKindLetter } from './labels.js';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** One kind per cycle day; cycle day 1 first. */
		value: ShiftKind[];
		disabled?: boolean;
	};

	let { value = $bindable(), disabled = false, class: className, ...restProps }: Props = $props();

	/** Kind being painted while the pointer is held down, `null` when not painting. */
	let painting = $state<ShiftKind | null>(null);

	const next = (kind: ShiftKind): ShiftKind =>
		SHIFT_KINDS[(SHIFT_KINDS.indexOf(kind) + 1) % SHIFT_KINDS.length];

	function set(index: number, kind: ShiftKind) {
		if (value[index] === kind) return;
		value = value.map((k, i) => (i === index ? kind : k));
	}

	function startPaint(event: PointerEvent, index: number) {
		if (disabled || event.button !== 0) return;
		// Let pointerenter fire on the other cells while the button is held (touch captures by default).
		if (event.target instanceof Element && event.target.hasPointerCapture(event.pointerId))
			event.target.releasePointerCapture(event.pointerId);
		painting = next(value[index]);
		set(index, painting);
	}

	/** Keys that set a cell: D / N / O. */
	const KEYS: Partial<Record<string, ShiftKind>> = { d: 'day', n: 'night', o: 'off' };

	function keydown(event: KeyboardEvent, index: number) {
		const kind = KEYS[event.key.toLowerCase()];
		if (!kind) return;
		event.preventDefault();
		set(index, kind);
	}

	function resize(length: number) {
		if (length < 1 || length > MAX_CYCLE_DAYS) return;
		value =
			length < value.length
				? value.slice(0, length)
				: [...value, ...Array<ShiftKind>(length - value.length).fill('off')];
	}

	const kindClass: Record<ShiftKind, string> = {
		day: 'bg-primary text-primary-foreground',
		night: 'bg-foreground text-background',
		off: 'bg-muted text-muted-foreground'
	};
</script>

<svelte:window onpointerup={() => (painting = null)} onpointercancel={() => (painting = null)} />

<div class={cn('flex flex-col gap-3', className)} {...restProps}>
	<div class="flex flex-wrap gap-1.5" role="group" aria-label={m.roster_cycle_cells()}>
		{#each value as kind, index (index)}
			<button
				type="button"
				{disabled}
				class={cn(
					'flex size-10 touch-none flex-col items-center justify-center rounded-md text-sm font-semibold transition-colors select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
					kindClass[kind]
				)}
				aria-label={m.roster_cycle_cell({ day: index + 1, kind: shiftKindLabel(kind) })}
				onpointerdown={(event) => startPaint(event, index)}
				onpointerenter={() => painting && set(index, painting)}
				onclick={(event) => {
					// Pointer clicks already painted on pointerdown; this handles Enter / Space.
					if (event.detail === 0) set(index, next(kind));
				}}
				onkeydown={(event) => keydown(event, index)}
			>
				<span aria-hidden="true">{shiftKindLetter(kind)}</span>
				<span class="text-[0.625rem] font-normal opacity-70" aria-hidden="true">{index + 1}</span>
			</button>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
		<span class="ms-auto">{m.roster_cycle_hint()}</span>
	</div>
</div>
