<script lang="ts">
	import { tick } from 'svelte';
	import { Debounced } from 'runed';
	import CaretUpDownIcon from 'phosphor-svelte/lib/CaretUpDownIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { MAX_PERSON_SEARCH, type PersonOption } from '#lib/attendance/person-search.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { findPeople } from '#lib/remote/people.remote.js';
	import { personName } from '#lib/utils/locale.js';

	// The person filter of a GET form (PR45): type a name or number, the server suggests people
	// (debounced), pick one (`staff`) or keep the text as a "contains" search (`q`, PR42).

	type Props = {
		/** The trigger's id, for its `<Label for>`. */
		id?: string;
		/** The picked person's id, '' for none; posted as `staff`. */
		staff?: string;
		/** The text search, '' for none; posted as `q`. */
		q?: string;
		/** The picked person as the page loaded it, for the trigger's label. */
		person: PersonOption | null;
		/** After a pick or a clear: the page submits its form. */
		onchange?: () => void;
		class?: string;
	};

	let {
		id,
		staff = $bindable(''),
		q = $bindable(''),
		person,
		onchange,
		class: className
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	/** The text the server is asked about: the search, once typing pauses. */
	const term = new Debounced(() => search.trim().slice(0, MAX_PERSON_SEARCH), 300);
	/** The shown pick: the loaded person, or the one just picked until the page reloads. */
	let picked = $derived(person);
	let triggerRef = $state<HTMLButtonElement | null>(null);

	function openChanged(next: boolean) {
		if (!next) return;
		// Start from the current text search, with its suggestions at once.
		search = q;
		term.setImmediately(q.trim());
	}

	async function choose(next: { staff: string; q: string }, option: PersonOption | null) {
		staff = next.staff;
		q = next.q;
		picked = option;
		open = false;
		onchange?.();
		// Back to the trigger, so the keyboard can go on through the form.
		await tick();
		triggerRef?.focus();
	}
</script>

<!-- The posted values stay in the form; the popover's content is portaled out of it. -->
{#if staff}
	<input type="hidden" name="staff" value={staff} />
{/if}
{#if q}
	<input type="hidden" name="q" value={q} />
{/if}

<Popover.Root bind:open onOpenChange={openChanged}>
	<Popover.Trigger {id} bind:ref={triggerRef}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class={['justify-between font-normal', className]}
				role="combobox"
				aria-expanded={open}
			>
				{#if staff && picked}
					<span class="flex min-w-0 items-baseline gap-2">
						<span class="truncate">{personName(picked)}</span>
						<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">
							{picked.employeeNo}
						</bdi>
					</span>
				{:else if q}
					<span class="truncate">{m.daily_person_contains({ text: q })}</span>
				{:else}
					<span class="truncate text-muted-foreground">{m.daily_search_placeholder()}</span>
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
				{#if search.trim()}
					<Command.Group>
						<Command.Item
							value="text-search"
							data-checked={!staff && q === search.trim()}
							onSelect={() => choose({ staff: '', q: search.trim() }, null)}
						>
							<MagnifyingGlassIcon />
							<span class="truncate">{m.daily_person_contains({ text: search.trim() })}</span>
						</Command.Item>
					</Command.Group>
				{/if}
				{#if term.current}
					{#await findPeople(term.current)}
						<Command.Loading class="flex items-center gap-2 px-2 py-3 text-muted-foreground">
							<SpinnerGapIcon class="size-4 animate-spin" />
							{m.daily_person_loading()}
						</Command.Loading>
					{:then people}
						{#if people.length > 0}
							<Command.Group heading={m.daily_person_people()}>
								{#each people as option (option.staffId)}
									<Command.Item
										value={option.staffId}
										data-checked={staff === option.staffId}
										onSelect={() => choose({ staff: option.staffId, q: '' }, option)}
									>
										<span class="truncate">{personName(option)}</span>
										<bdi class="font-mono text-muted-foreground" dir="ltr">{option.employeeNo}</bdi>
									</Command.Item>
								{/each}
							</Command.Group>
						{:else}
							<p class="px-2 py-3 text-muted-foreground">{m.daily_person_none()}</p>
						{/if}
					{:catch}
						<p class="px-2 py-3 text-destructive">{m.daily_person_error()}</p>
					{/await}
				{:else}
					<p class="px-2 py-3 text-muted-foreground">{m.daily_person_hint()}</p>
				{/if}
				{#if staff || q}
					<Command.Separator />
					<Command.Group>
						<Command.Item value="clear" onSelect={() => choose({ staff: '', q: '' }, null)}>
							<XIcon />
							{m.daily_person_clear()}
						</Command.Item>
					</Command.Group>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
