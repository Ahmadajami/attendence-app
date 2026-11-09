<script lang="ts">
	import { tick } from 'svelte';
	import CaretUpDownIcon from 'phosphor-svelte/lib/CaretUpDownIcon';
	import {
		filterPeople,
		MAX_PERSON_SEARCH,
		type PersonOption
	} from '#lib/attendance/person-search.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { personName } from '#lib/utils/locale.js';

	// Pick one person from a list the page already loaded (the people a form may choose), by
	// typing part of a name (English or Arabic) or an employee number. Replaces a long `Select`
	// of employees. People found by the server instead: `PersonPicker` (swaps) or
	// `PersonCombobox` (daily filter). Form-agnostic: `value` is the picked staff id ('' for
	// none); with `name`, a hidden input posts it (also ''). The rest (a Formsnap control's
	// `id`, `aria-*`, `data-*`) goes on the trigger.

	/** At most this many matches are drawn; typing more narrows the rest. */
	const SHOWN = 100;

	type Props = {
		/** The people who can be picked, in display order. */
		options: readonly PersonOption[];
		/** The picked person's id, '' for none. */
		value?: string;
		/** Posts `value` under this name. */
		name?: string;
		/** The trigger's id (a `<Label for>`, or the Formsnap control's). */
		id?: string;
		class?: string;
		/** A Formsnap control's `aria-*` / `data-*` attributes, for the trigger. */
		[attribute: `aria-${string}` | `data-${string}`]: string | boolean | undefined | null;
		/** The trigger's text while nobody is picked. */
		placeholder?: string;
		/** With a label: an item first in the list that picks nobody (''). */
		noneLabel?: string;
		disabled?: boolean;
		/** After a pick. */
		onchange?: (person: PersonOption | null) => void;
	};

	let {
		options,
		value = $bindable(''),
		name,
		id,
		class: className,
		placeholder,
		noneLabel,
		disabled = false,
		onchange,
		...restProps
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	let triggerRef = $state<HTMLButtonElement | null>(null);

	const picked = $derived(options.find((option) => option.staffId === value) ?? null);
	const matches = $derived(filterPeople(options, search));
	const shown = $derived(matches.slice(0, SHOWN));

	function openChanged(next: boolean) {
		if (next) search = '';
	}

	async function choose(option: PersonOption | null) {
		value = option?.staffId ?? '';
		open = false;
		onchange?.(option);
		// Back to the trigger, so the keyboard can go on through the form.
		await tick();
		triggerRef?.focus();
	}
</script>

{#if name}
	<input type="hidden" {name} {value} />
{/if}

<Popover.Root bind:open onOpenChange={openChanged}>
	<Popover.Trigger {id} {disabled} bind:ref={triggerRef}>
		{#snippet child({ props })}
			<Button
				{...restProps}
				{...props}
				variant="outline"
				class={['justify-between font-normal', className]}
				role="combobox"
				aria-expanded={open}
			>
				{#if picked}
					<span class="flex min-w-0 items-baseline gap-2">
						<span class="truncate">{personName(picked)}</span>
						<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
							{picked.employeeNo}
						</bdi>
					</span>
				{:else if noneLabel}
					<span class="truncate">{noneLabel}</span>
				{:else}
					<span class="truncate text-muted-foreground">
						{placeholder ?? m.swap_person_placeholder()}
					</span>
				{/if}
				<CaretUpDownIcon class="text-muted-foreground" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-80 p-0" align="start">
		<!-- `filterPeople` filters (names in both languages, employee number); the list shows its answer. -->
		<Command.Root shouldFilter={false}>
			<Command.Input
				bind:value={search}
				maxlength={MAX_PERSON_SEARCH}
				placeholder={m.daily_search_placeholder()}
			/>
			<Command.List>
				{#if noneLabel && !search.trim()}
					<Command.Group>
						<Command.Item value="none" data-checked={!value} onSelect={() => choose(null)}>
							<span class="truncate">{noneLabel}</span>
						</Command.Item>
					</Command.Group>
				{/if}
				{#if shown.length > 0}
					<Command.Group heading={m.daily_person_people()}>
						{#each shown as option (option.staffId)}
							<Command.Item
								value={option.staffId}
								data-checked={value === option.staffId}
								onSelect={() => choose(option)}
							>
								<span class="truncate">{personName(option)}</span>
								<bdi class="font-mono text-muted-foreground" dir="ltr">{option.employeeNo}</bdi>
							</Command.Item>
						{/each}
					</Command.Group>
					{#if matches.length > shown.length}
						<p class="px-2 py-2 text-xs text-muted-foreground">
							{m.people_more_matches({ count: matches.length - shown.length })}
						</p>
					{/if}
				{:else}
					<p class="px-2 py-3 text-muted-foreground">{m.daily_person_none()}</p>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
