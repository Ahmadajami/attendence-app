<script lang="ts">
	import type { Select as SelectPrimitive } from 'bits-ui';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { StaffListKind } from '#lib/schemas/staff-lists.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import type { WithoutChildren } from '#lib/utils.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { getStaffLists } from './context.js';
	import { newItemLabel } from './labels.js';

	type Props = WithoutChildren<Omit<SelectPrimitive.TriggerProps, 'value'>> & {
		/** The chosen item's id; `''` = none. */
		value: string;
		/** The list (active and inactive); the picker offers the active ones and the chosen one. */
		items: StaffListOption[];
		kind: StaffListKind;
		/** Trigger text when nothing is chosen. */
		placeholder: string;
		/** Offer a "none" item (`noneLabel`) that sets `''`. */
		allowNone?: boolean;
		noneLabel?: string;
		disabled?: boolean;
	};

	let {
		value = $bindable(),
		items,
		kind,
		placeholder,
		allowNone = false,
		noneLabel,
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();

	// Item values that are never stored: posting stays with the caller (hidden input).
	const NONE = '__none__';
	const NEW = '__new__';

	const lists = getStaffLists();
	/** Shown until the reloaded list has it. */
	let created = $state<StaffListOption | null>(null);

	const options = $derived.by(() => {
		const shown = items.filter((item) => item.active || item.id === value);
		return created && !shown.some((item) => item.id === created?.id) ? [...shown, created] : shown;
	});
	const selected = $derived(options.find((item) => item.id === value));
	const selectValue = $derived(value || (allowNone ? NONE : ''));

	function choose(next: string) {
		if (next === NEW) {
			lists.create(kind, (item) => {
				created = item;
				value = item.id;
			});
		} else {
			value = next === NONE ? '' : next;
		}
	}
</script>

<Select.Root type="single" bind:value={() => selectValue, choose} {disabled}>
	<Select.Trigger {...restProps} class={['w-full', className]}>
		{selected ? lookupName(selected) : allowNone && noneLabel ? noneLabel : placeholder}
	</Select.Trigger>
	<Select.Content>
		{#if allowNone}
			<Select.Item value={NONE} label={noneLabel ?? placeholder} />
		{/if}
		{#each options as item (item.id)}
			<Select.Item value={item.id} label={lookupName(item)} />
		{/each}
		<Select.Separator />
		<Select.Item value={NEW} label={newItemLabel(kind)}>
			<PlusIcon />
			{newItemLabel(kind)}
		</Select.Item>
	</Select.Content>
</Select.Root>
