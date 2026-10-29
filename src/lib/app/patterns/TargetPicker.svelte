<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { AssignTargetKind } from '#lib/schemas/pattern.schema.js';
	import { cn } from '#lib/utils.js';
	import { lookupName, personName } from '#lib/utils/locale.js';

	type Option = {
		id: string;
		nameEn: string;
		nameAr: string | null;
		/** Employee number, shown beside a person. */
		detail: string | null;
		departmentId: string | null;
	};

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		kind: AssignTargetKind;
		ids: string[];
		options: Record<AssignTargetKind, Option[]>;
		departments: { id: string; nameEn: string; nameAr: string }[];
		disabled?: boolean;
	};

	let {
		kind = $bindable(),
		ids = $bindable(),
		options,
		departments,
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();

	const uid = $props.id();
	const ALL = 'all';
	let department = $state(ALL);
	let query = $state('');

	const label = (o: Option) => personName({ fullName: o.nameEn, fullNameAr: o.nameAr });
	const shown = $derived.by(() => {
		const q = query.trim().toLocaleLowerCase();
		return options[kind].filter(
			(o) =>
				(kind === 'department' || department === ALL || o.departmentId === department) &&
				(!q ||
					o.nameEn.toLocaleLowerCase().includes(q) ||
					(o.nameAr?.includes(q) ?? false) ||
					(o.detail?.includes(q) ?? false))
		);
	});
	const departmentName = $derived(departments.find((d) => d.id === department));

	/** Switching kind clears the choice: ids of another kind mean nothing here. */
	function setKind(next: string) {
		if (!next || next === kind) return;
		kind = next as AssignTargetKind;
		ids = [];
	}

	function toggle(id: string, checked: boolean) {
		ids = checked ? [...ids, id] : ids.filter((x) => x !== id);
	}
</script>

<div class={cn('flex flex-col gap-3', className)} {...restProps}>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		class="self-start"
		{disabled}
		bind:value={() => kind, setKind}
	>
		<ToggleGroup.Item value="staff">{m.assign_kind_staff()}</ToggleGroup.Item>
		<ToggleGroup.Item value="team">{m.assign_kind_team()}</ToggleGroup.Item>
		<ToggleGroup.Item value="department">{m.assign_kind_department()}</ToggleGroup.Item>
	</ToggleGroup.Root>

	<div class="flex flex-wrap gap-2">
		{#if kind !== 'department'}
			<Select.Root type="single" bind:value={department} {disabled}>
				<Select.Trigger class="w-56" aria-label={m.assign_filter_department()}>
					{departmentName ? lookupName(departmentName) : m.assign_all_departments()}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value={ALL} label={m.assign_all_departments()} />
					{#each departments as option (option.id)}
						<Select.Item value={option.id} label={lookupName(option)} />
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}
		<InputGroup.Root class="w-56">
			<InputGroup.Addon>
				<MagnifyingGlassIcon />
			</InputGroup.Addon>
			<InputGroup.Input
				type="search"
				bind:value={query}
				placeholder={m.assign_search()}
				aria-label={m.assign_search()}
				{disabled}
			/>
		</InputGroup.Root>
	</div>

	<ul class="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md bg-muted/40 p-2">
		{#each shown as option (option.id)}
			<li class="flex items-center gap-2">
				<Checkbox
					id="{uid}-{option.id}"
					checked={ids.includes(option.id)}
					onCheckedChange={(checked) => toggle(option.id, checked === true)}
					{disabled}
				/>
				<Label for="{uid}-{option.id}" class="font-normal">
					{label(option)}
					{#if option.detail}
						<bdi class="font-mono text-xs text-muted-foreground" dir="ltr">{option.detail}</bdi>
					{/if}
				</Label>
			</li>
		{:else}
			<li class="p-2 text-sm text-muted-foreground">{m.assign_no_matches()}</li>
		{/each}
	</ul>
	<p class="text-sm text-muted-foreground">{m.assign_chosen({ count: ids.length })}</p>
</div>
