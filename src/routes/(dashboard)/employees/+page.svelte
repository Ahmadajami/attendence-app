<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { DragEndEvent } from '@dnd-kit/dom';
	import { DragDropProvider, DragOverlay } from '@dnd-kit/svelte';
	import { toast } from 'svelte-sonner';
	import ArrowsLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRightIcon';
	import IdentificationCardIcon from 'phosphor-svelte/lib/IdentificationCardIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as UnderlineTabs from '#lib/components/ui/underline-tabs/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow, TeamOption } from '#lib/types/workforce.js';
	import type { PageProps } from './$types';
	import EmployeeCards from './EmployeeCards.svelte';
	import EmployeesTable from './EmployeesTable.svelte';
	import StatusFilter from './StatusFilter.svelte';
	import TeamTable from './TeamTable.svelte';
	import {
		ALL_EMPLOYEES,
		employeeName,
		employeeStatus,
		employeeView,
		filterByStatus,
		statusCounts
	} from './labels.js';
	import { setPersonalPatternIds } from './context.js';

	let { data }: PageProps = $props();

	/** The open tab lives in `?view=`; the load doesn't read it, so switching doesn't refetch. */
	const view = $derived(employeeView(page.url.searchParams.get('view')));

	function setView(next: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('view', next);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only `?view=` changes
		void goto(url, { replace: true, reset: false });
	}

	const personalPatternIds = $derived(new Set(data.personalPatternIds));
	setPersonalPatternIds(() => personalPatternIds);

	let teamOverrides = $state<Record<string, TeamOption | null>>({});

	const employees = $derived(
		data.employees.map((employee) => ({
			...employee,
			team: employee.id in teamOverrides ? teamOverrides[employee.id] : employee.team
		}))
	);

	/**
	 * The status filter (M22) lives in `?status=` and appears only once someone is inactive;
	 * until then everyone is shown. Counts come from the whole list.
	 */
	const counts = $derived(statusCounts(employees));
	const showStatusFilter = $derived(counts.inactive > 0);
	const status = $derived(
		showStatusFilter ? employeeStatus(page.url.searchParams.get('status')) : 'all'
	);
	const visibleEmployees = $derived(filterByStatus(employees, status));

	const teams = $derived(data.teams);
	const teamById = $derived.by(() => {
		const map = new SvelteMap<string, TeamOption>(teams.map((team) => [team.id, team]));
		for (const employee of employees) {
			if (employee.team) map.set(employee.team.id, employee.team);
		}
		return map;
	});
	const employeeById = $derived(new SvelteMap(employees.map((e) => [e.id, e])));
	const membersByTeam = $derived(
		Object.fromEntries(
			teams.map((team) => [
				team.id,
				employees
					.filter((e) => e.active && e.team?.id === team.id)
					.sort((a, b) => employeeName(a).localeCompare(employeeName(b)))
			])
		)
	);

	// ---- Drag and drop: optimistic move, persisted through ?/setTeam ----
	let teamForm: HTMLFormElement | null = $state(null);
	let teamRequest = $state({ staffId: '', teamId: '' });
	let moving = false;
	let lastMove: { employeeId: string; previousTeam: TeamOption | null } | null = null;

	async function submitMove(employee: StaffRow, nextTeam: TeamOption | null) {
		if (moving || !employee.active || employee.team?.id === nextTeam?.id) return;

		lastMove = { employeeId: employee.id, previousTeam: employee.team };
		teamOverrides = { ...teamOverrides, [employee.id]: nextTeam };
		moving = true;
		teamRequest = { staffId: employee.id, teamId: nextTeam?.id ?? '' };
		await tick();
		teamForm?.requestSubmit();
	}

	function handleDragEnd(event: DragEndEvent) {
		const { source, target: over } = event.operation;
		if (event.canceled || !source || !over) return;

		const employee = employeeById.get(source.data?.employeeId);
		if (!employee) return;

		if (over.id === ALL_EMPLOYEES) {
			if (source.data?.from === ALL_EMPLOYEES) return;
			void submitMove(employee, null);
			return;
		}

		void submitMove(employee, teamById.get(String(over.id)) ?? null);
	}

	const onMoveResult: SubmitFunction = () => {
		return async ({ result, update }) => {
			const move = lastMove;
			if (move) {
				if (result.type === 'failure') {
					teamOverrides = { ...teamOverrides, [move.employeeId]: move.previousTeam };
				}
				if (result.type === 'success' || result.type === 'failure') {
					const notice = result.data?.notice;
					if (typeof notice === 'string') {
						if (result.type === 'success') toast.success(notice);
						else toast.error(notice);
					}
				}
			}
			moving = false;
			lastMove = null;
			await update();
			await refreshAll();
			if (move) {
				const next = { ...teamOverrides };
				delete next[move.employeeId];
				teamOverrides = next;
			}
		};
	};

	// ---- Activate / deactivate through the same hidden form pattern as Accounts ----
	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ staffId: '', active: 'false' });

	async function toggleActive(employee: StaffRow) {
		activeRequest = { staffId: employee.id, active: String(!employee.active) };
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
			await refreshAll();
		};
	};
</script>

<svelte:head>
	<title>{m.employees_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-wrap items-start justify-between gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.employees_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.employees_description()}</p>
	</div>
	<Button href={localizedHref('/employees/new')}>
		<PlusIcon data-icon="inline-start" />
		{m.staff_new()}
	</Button>
</section>

<UnderlineTabs.Root bind:value={() => view, setView}>
	<UnderlineTabs.List class="max-w-full overflow-x-auto">
		<UnderlineTabs.Trigger value="cards">
			<IdentificationCardIcon />
			{m.employees_view_cards()}
		</UnderlineTabs.Trigger>
		<UnderlineTabs.Trigger value="move">
			<ArrowsLeftRightIcon />
			{m.employees_view_move()}
		</UnderlineTabs.Trigger>
	</UnderlineTabs.List>

	<UnderlineTabs.Content value="cards">
		<EmployeeCards
			employees={visibleEmployees}
			onToggleActive={toggleActive}
			filter={showStatusFilter ? statusFilter : undefined}
		/>
	</UnderlineTabs.Content>

	<UnderlineTabs.Content value="move" class="flex flex-col gap-4">
		<p class="max-w-prose text-muted-foreground">{m.employees_move_description()}</p>
		<DragDropProvider onDragEnd={handleDragEnd}>
			<!-- Employees full width on top (scrolling inside, so the teams stay in reach for a drag),
			     teams in a grid below. -->
			<div class="flex flex-col gap-4">
				<EmployeesTable
					employees={visibleEmployees}
					{teamById}
					onToggleActive={toggleActive}
					filter={showStatusFilter ? statusFilter : undefined}
					class="max-h-[55dvh]"
				/>

				<section aria-labelledby="teams-heading" class="flex flex-col gap-4">
					<h3 id="teams-heading" class="text-sm font-medium text-muted-foreground">
						{m.employees_teams()}
					</h3>
					<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
						{#each teams as team (team.id)}
							<TeamTable {team} members={membersByTeam[team.id]} />
						{/each}
					</div>
				</section>
			</div>

			<DragOverlay>
				{#snippet children(source)}
					{const employee = $derived(employeeById.get(source.data?.employeeId))}
					{#if employee}
						<div
							class="bg-popover px-3 py-2 text-xs font-medium shadow-lg ring-1 ring-foreground/10"
						>
							{employeeName(employee)}
							<bdi dir="ltr" class="ms-2 font-mono text-muted-foreground"
								>{employee.employeeNo}</bdi
							>
						</div>
					{/if}
				{/snippet}
			</DragOverlay>
		</DragDropProvider>
	</UnderlineTabs.Content>
</UnderlineTabs.Root>

{#snippet statusFilter()}
	<StatusFilter {status} {counts} {view} />
{/snippet}

<form bind:this={teamForm} method="POST" action="?/setTeam" use:enhance={onMoveResult} hidden>
	<input type="hidden" name="staffId" value={teamRequest.staffId} />
	<input type="hidden" name="teamId" value={teamRequest.teamId} />
</form>

<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
	<input type="hidden" name="staffId" value={activeRequest.staffId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>
