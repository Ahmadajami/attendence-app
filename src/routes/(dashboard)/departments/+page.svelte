<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { enhance, type SubmitFunction } from '$app/forms';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import CalendarPlusIcon from 'phosphor-svelte/lib/CalendarPlusIcon';
	import UserSwitchIcon from 'phosphor-svelte/lib/UserSwitchIcon';
	import ManagerSheet from '#lib/app/management/ManagerSheet.svelte';
	import AssignSheet from '#lib/app/patterns/AssignSheet.svelte';
	import { formatCalendarDate } from '#lib/app/roster/labels.js';
	import { localizedHref } from '#lib/i18n.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { lookupName, personName } from '#lib/utils/locale.js';
	import DepartmentFormSheet from './DepartmentFormSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Department = (typeof data.departments)[number];

	let formOpen = $state(false);
	let target = $state<Department | null>(null);

	function openCreate() {
		target = null;
		formOpen = true;
	}

	function openEdit(row: Department) {
		target = row;
		formOpen = true;
	}

	const departmentById = $derived(new Map(data.departments.map((d) => [d.id, d])));

	function departmentName(id: string): string {
		const department = departmentById.get(id);
		return department ? lookupName(department) : '—';
	}

	// The manager changes from a date, with a reason, in its own sheet (management M25).
	let managerOpen = $state(false);
	let managerOf = $state<Department | null>(null);

	function openManager(row: Department) {
		managerOf = row;
		managerOpen = true;
	}

	const patternById = $derived(new Map(data.patterns.map((p) => [p.id, p])));
	const activePatterns = $derived(data.patterns.filter((p) => p.active));
	let assignOpen = $state(false);
	let assignTo = $state<Department | null>(null);

	function openAssign(row: Department) {
		assignTo = row;
		assignOpen = true;
	}

	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ departmentId: '', active: 'false' });

	async function setActive(row: Department, active: boolean) {
		activeRequest = { departmentId: row.id, active: String(active) };
		await tick();
		activeForm?.requestSubmit();
	}

	const toastNotice: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' || result.type === 'failure') {
				const notice = result.data?.notice;
				if (typeof notice === 'string') {
					if (result.type === 'success') toast.success(notice);
					else toast.error(notice);
				}
			}
			await update();
		};
	};
</script>

<svelte:head>
	<title>{m.departments_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.departments_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.departments_description()}</p>
		</div>
		<Button onclick={openCreate}>
			<PlusIcon data-icon="inline-start" />
			{m.departments_new()}
		</Button>
	</div>

	<Card.Root>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.departments_col_name()}</Table.Head>
						<Table.Head>{m.departments_col_manager()}</Table.Head>
						<Table.Head>{m.departments_col_staff()}</Table.Head>
						<Table.Head>{m.departments_col_pattern()}</Table.Head>
						<Table.Head>{m.departments_col_status()}</Table.Head>
						<Table.Head>
							<span class="sr-only">{m.departments_actions({ name: '' })}</span>
						</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.departments as row (row.id)}
						<Table.Row class={row.active ? undefined : 'text-muted-foreground'}>
							<Table.Cell class="font-medium">
								<span
									class="inline-flex flex-col"
									style:padding-inline-start="{row.depth * 1.25}rem"
								>
									<span>{lookupName(row)}</span>
									{#if row.activeChildCount > 0}
										<span class="text-xs font-normal text-muted-foreground">
											{m.departments_sub_count({ count: row.activeChildCount })}
										</span>
									{/if}
								</span>
							</Table.Cell>
							<Table.Cell class="text-sm">
								{#if row.manager}
									{personName(row.manager)}
								{:else if row.coveredBy}
									<span class="text-muted-foreground">
										{m.management_covered_by({
											name: personName(row.coveredBy),
											department: departmentName(row.coveredBy.departmentId)
										})}
									</span>
								{:else}
									—
								{/if}
							</Table.Cell>
							<Table.Cell>
								<span class="inline-flex items-center gap-1.5 text-muted-foreground">
									<UsersThreeIcon class="size-4" />
									{row.staffCount}
								</span>
							</Table.Cell>
							<Table.Cell class="text-sm">
								{#if row.assignment}
									{const assigned = $derived(patternById.get(row.assignment.patternId))}
									{#if assigned}
										<a
											href={localizedHref('/patterns/[id]', { id: assigned.id })}
											class="hover:underline"
										>
											{lookupName(assigned)}
										</a>
										<span class="block text-xs text-muted-foreground">
											{m.team_schedule_since({
												date: formatCalendarDate(row.assignment.effectiveFrom)
											})}
										</span>
									{/if}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<Badge variant={row.active ? 'secondary' : 'outline'}>
									{row.active ? m.departments_status_active() : m.departments_status_inactive()}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-end">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												size="icon"
												aria-label={m.departments_actions({ name: lookupName(row) })}
											>
												<DotsThreeIcon />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item onSelect={() => openEdit(row)}>
											<PencilSimpleIcon />
											{m.departments_edit()}
										</DropdownMenu.Item>
										{#if row.active}
											<DropdownMenu.Item onSelect={() => openManager(row)}>
												<UserSwitchIcon />
												{m.management_change_manager()}
											</DropdownMenu.Item>
										{/if}
										{#if data.canManage && row.active}
											<DropdownMenu.Item onSelect={() => openAssign(row)}>
												<CalendarPlusIcon />
												{m.departments_assign_pattern()}
											</DropdownMenu.Item>
										{/if}
										<DropdownMenu.Separator />
										{#if row.active}
											<DropdownMenu.Item
												variant="destructive"
												onSelect={() => setActive(row, false)}
											>
												<ProhibitIcon />
												{m.departments_deactivate()}
											</DropdownMenu.Item>
										{:else}
											<DropdownMenu.Item onSelect={() => setActive(row, true)}>
												<CheckCircleIcon />
												{m.departments_activate()}
											</DropdownMenu.Item>
										{/if}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="h-20 text-center text-muted-foreground">
								{m.departments_empty()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>

<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
	<input type="hidden" name="departmentId" value={activeRequest.departmentId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>

{#if data.canManage}
	<AssignSheet
		data={data.assignForm}
		action="?/assign"
		targetKind="department"
		targetId={assignTo?.id ?? ''}
		patterns={activePatterns}
		today={data.today}
		buildHref={assignTo
			? `${localizedHref('/patterns/new')}?targetKind=department&targetId=${assignTo.id}`
			: undefined}
		title={m.departments_assign_pattern()}
		description={m.departments_assign_description({
			name: assignTo ? lookupName(assignTo) : ''
		})}
		bind:open={assignOpen}
	/>
{/if}

<DepartmentFormSheet
	data={data.form}
	{target}
	departments={data.departments}
	bind:open={formOpen}
/>

<ManagerSheet
	data={data.managerForm}
	action="?/setManager"
	department={managerOf}
	currentStaffId={managerOf?.managerStaffId ?? null}
	people={data.managers}
	history={managerOf ? (data.histories[managerOf.id] ?? []) : []}
	today={data.today}
	bind:open={managerOpen}
/>
