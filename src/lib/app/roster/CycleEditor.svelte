<script lang="ts">
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { DateFormatter } from '@internationalized/date';
	import MinusIcon from 'phosphor-svelte/lib/MinusIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { MAX_CYCLE_DAYS } from '#lib/roster/rules.js';
	import type { RosterShift } from '#lib/roster/shift.js';
	import type { PatternType } from '#lib/schemas/enums.js';
	import { cn } from '#lib/utils.js';
	import ShiftChip from './ShiftChip.svelte';
	import { shiftsById, slotLabel } from './labels.js';

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

	const byId = $derived(shiftsById(shifts));
	const palette = $derived(shifts.filter((s) => s.active));

	/** What a click or drag paints: a shift id, or `null` for off. Starts on the first shift. */
	let brush = $state<string | null>(untrack(() => shifts.find((s) => s.active)?.id ?? null));
	/** True while the pointer is held down. */
	let painting = $state(false);

	const shiftOf = (id: string | null) => (id === null ? null : (byId.get(id) ?? null));

	function set(index: number, slot: string | null) {
		if (value[index] === slot) return;
		value = value.map((s, i) => (i === index ? slot : s));
	}

	function startPaint(event: PointerEvent, index: number) {
		if (disabled || event.button !== 0) return;
		// Let pointerenter fire on the other cells while the button is held (touch captures by default).
		if (event.target instanceof Element && event.target.hasPointerCapture(event.pointerId))
			event.target.releasePointerCapture(event.pointerId);
		painting = true;
		set(index, brush);
	}

	/** Typing a one-letter shift code sets that shift; `-` sets off. */
	function keydown(event: KeyboardEvent, index: number) {
		if (event.key === '-') {
			event.preventDefault();
			set(index, null);
			return;
		}
		const match = palette.find((s) => s.code.toLowerCase() === event.key.toLowerCase());
		if (!match) return;
		event.preventDefault();
		set(index, match.id);
	}

	function resize(length: number) {
		if (length < 1 || length > MAX_CYCLE_DAYS) return;
		value =
			length < value.length
				? value.slice(0, length)
				: [...value, ...Array<string | null>(length - value.length).fill(null)];
	}

	/** Weekday names, Sunday first (2026-01-04 is a Sunday). */
	const weekdays = $derived.by(() => {
		const format = new DateFormatter(getLocale(), { weekday: 'short', timeZone: 'UTC' });
		return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2026, 0, 4 + i))));
	});

	const cellName = (index: number) => (type === 'weekly' ? weekdays[index] : String(index + 1));
	const brushClass = (active: boolean) =>
		cn(
			'rounded-md p-0.5 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
			active && 'ring-2 ring-ring ring-offset-2'
		);
</script>

<svelte:window onpointerup={() => (painting = false)} onpointercancel={() => (painting = false)} />

<div class={cn('flex flex-col gap-3', className)} {...restProps}>
	<div class="flex flex-wrap items-center gap-2" role="group" aria-label={m.roster_palette()}>
		{#each palette as shift (shift.id)}
			<button
				type="button"
				{disabled}
				aria-pressed={brush === shift.id}
				title={slotLabel(shift)}
				class={brushClass(brush === shift.id)}
				onclick={() => (brush = shift.id)}
			>
				<ShiftChip {shift} />
			</button>
		{/each}
		<button
			type="button"
			{disabled}
			aria-pressed={brush === null}
			title={slotLabel(null)}
			class={brushClass(brush === null)}
			onclick={() => (brush = null)}
		>
			<ShiftChip shift={null} />
		</button>
	</div>

	<div class="flex flex-wrap gap-1.5" role="group" aria-label={m.roster_cycle_cells()}>
		{#each value as slot, index (index)}
			{const shift = shiftOf(slot)}
			<button
				type="button"
				{disabled}
				class={cn(
					'flex size-11 touch-none flex-col items-center justify-center rounded-md text-sm font-semibold transition-colors select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
					shift ? 'text-white' : 'bg-muted text-muted-foreground'
				)}
				style:background-color={shift?.colour}
				aria-label={m.roster_cycle_cell({ day: cellName(index), kind: slotLabel(shift) })}
				onpointerdown={(event) => startPaint(event, index)}
				onpointerenter={() => painting && set(index, brush)}
				onclick={(event) => {
					// Pointer clicks already painted on pointerdown; this handles Enter / Space.
					if (event.detail === 0) set(index, brush);
				}}
				onkeydown={(event) => keydown(event, index)}
			>
				<bdi aria-hidden="true" dir="ltr">{shift?.code ?? m.roster_letter_off()}</bdi>
				<span class="text-[0.625rem] font-normal opacity-80" aria-hidden="true">
					{cellName(index)}
				</span>
			</button>
		{/each}
	</div>

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
		<span class="ms-auto">{m.roster_cycle_hint()}</span>
	</div>
</div>
