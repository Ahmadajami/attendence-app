<script lang="ts">
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import Empty from '#lib/app/state/Empty.svelte';
	import { filterPeople, MAX_PERSON_SEARCH } from '#lib/attendance/person-search.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { DepartmentMember } from '#lib/server/services/departments/departments.bl.js';
	import { endSide, lookupName, personName } from '#lib/utils/locale.js';

	type Props = {
		/** The department whose people are shown; `null` while nothing was picked. */
		department: { nameEn: string; nameAr: string } | null;
		/** Its active employees, by name. */
		members: DepartmentMember[];
		open: boolean;
	};

	let { department, members, open = $bindable() }: Props = $props();

	let search = $state('');
	const shown = $derived(filterPeople(members, search));
</script>

<!-- A department's active employees (the Employees column's count), searchable; read-only. -->
<!-- Closing clears the search, so the next department opens on its whole list. -->
<Sheet.Root bind:open onOpenChange={(next) => !next && (search = '')}>
	<Sheet.Content side={endSide()} class="overflow-y-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>
				{m.departments_staff_title({ name: department ? lookupName(department) : '' })}
			</Sheet.Title>
			<Sheet.Description>
				{m.departments_staff_description({ count: members.length })}
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-col gap-4 px-4 pb-4">
			{#if members.length === 0}
				<Empty icon={UsersThreeIcon} title={m.departments_staff_empty()} />
			{:else}
				<InputGroup.Root>
					<InputGroup.Addon>
						<MagnifyingGlassIcon />
					</InputGroup.Addon>
					<InputGroup.Input
						type="search"
						bind:value={search}
						maxlength={MAX_PERSON_SEARCH}
						placeholder={m.daily_search_placeholder()}
						aria-label={m.daily_search_placeholder()}
					/>
				</InputGroup.Root>

				{#if shown.length > 0}
					<ul class="flex flex-col divide-y divide-border">
						{#each shown as person (person.staffId)}
							<li class="flex flex-col gap-0.5 py-2">
								<a
									href={localizedHref('/employees/[id]', { id: person.staffId })}
									class="font-medium hover:underline"
								>
									{personName(person)}
								</a>
								<span class="text-xs text-muted-foreground">
									<bdi dir="ltr" class="font-mono">{person.employeeNo}</bdi>
									·
									{person.team ? lookupName(person.team) : m.employees_no_team()}
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-muted-foreground">{m.daily_person_none()}</p>
				{/if}
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
