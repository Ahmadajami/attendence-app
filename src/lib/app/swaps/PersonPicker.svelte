<script lang="ts">
	import { tick } from 'svelte';
	import { resource } from 'runed';
	import CaretUpDownIcon from 'phosphor-svelte/lib/CaretUpDownIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { MAX_PERSON_SEARCH, type PersonOption } from '#lib/attendance/person-search.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { findPeople } from '#lib/remote/people.remote.js';
	import { personName } from '#lib/utils/locale.js';

	// Pick one person (swaps plan SW10): type a name or number, the server suggests people
	// (debounced, `findPeople`), pick one. The shown suggestions stay until the next answer
	// arrives, so a click never lands on a list being replaced. Form-agnostic: `value` is the
	// picked staff id ('' for none); with `name`, a hidden input posts it. The rest (a Formsnap
	// control's `id`, `aria-*`) goes on the trigger.

	type Props = {
		/** The trigger's id (a `<Label for>`, or the Formsnap control's). */
		id?: string;
		class?: string;
		/** A Formsnap control's `aria-*` / `data-*` attributes, for the trigger. */
		[attribute: `aria-${string}` | `data-${string}`]: string | boolean | undefined | null;
		/** The picked person's id, '' for none. */
		value?: string;
		/** Posts `value` under this name. */
		name?: string;
		/** The picked person as loaded, for the trigger's label. */
		person?: PersonOption | null;
		placeholder?: string;
		/** May the pick be cleared (filters); a form field keeps one once picked. */
		clearable?: boolean;
		/** After a pick or a clear. */
		onchange?: (person: PersonOption | null) => void;
	};

	let {
		id,
		value = $bindable(''),
		name,
		person = null,
		placeholder,
		clearable = false,
		onchange,
		class: className,
		...restProps
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	const term = $derived(search.trim().slice(0, MAX_PERSON_SEARCH));
	/** The server's suggestions for the text, once typing pauses; `null` with no text. */
	const people = resource(
		() => term,
		async (text, _previous, { signal }) => {
			const found = text ? await findPeople(text) : null;
			// An older answer arriving after a newer question is dropped.
			if (signal.aborted) throw new DOMException('stale', 'AbortError');
			return found;
		},
		{ debounce: 250 }
	);
	/** The shown pick: the loaded person, or the one just picked. */
	let picked = $derived(person);
	let triggerRef = $state<HTMLButtonElement | null>(null);

	async function choose(option: PersonOption | null) {
		value = option?.staffId ?? '';
		picked = option;
		open = false;
		search = '';
		onchange?.(option);
		await tick();
		triggerRef?.focus();
	}
</script>

{#if name && value}
	<input type="hidden" {name} {value} />
{/if}

<Popover.Root bind:open>
	<Popover.Trigger {id} bind:ref={triggerRef}>
		{#snippet child({ props })}
			<Button
				{...restProps}
				{...props}
				variant="outline"
				class={['justify-between font-normal', className]}
				role="combobox"
				aria-expanded={open}
			>
				{#if value && picked}
					<span class="flex min-w-0 items-baseline gap-2">
						<span class="truncate">{personName(picked)}</span>
						<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
							{picked.employeeNo}
						</bdi>
					</span>
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
		<!-- The server filters; the list shows its answer as is. -->
		<Command.Root shouldFilter={false}>
			<Command.Input
				bind:value={search}
				maxlength={MAX_PERSON_SEARCH}
				placeholder={m.daily_search_placeholder()}
			/>
			<Command.List>
				{#if !term}
					<p class="px-2 py-3 text-muted-foreground">{m.daily_person_hint()}</p>
				{:else if people.error}
					<p class="px-2 py-3 text-destructive">{m.daily_person_error()}</p>
				{:else if people.current && people.current.length > 0}
					<Command.Group heading={m.daily_person_people()}>
						{#each people.current as option (option.staffId)}
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
				{:else if people.current && !people.loading}
					<p class="px-2 py-3 text-muted-foreground">{m.daily_person_none()}</p>
				{/if}
				{#if term && people.loading}
					<Command.Loading class="flex items-center gap-2 px-2 py-2 text-muted-foreground">
						<SpinnerGapIcon class="size-4 animate-spin" />
						{m.daily_person_loading()}
					</Command.Loading>
				{/if}
				{#if clearable && value}
					<Command.Separator />
					<Command.Group>
						<Command.Item value="clear" onSelect={() => choose(null)}>
							<XIcon />
							{m.daily_person_clear()}
						</Command.Item>
					</Command.Group>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
