<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { DragDropProvider, DragOverlay, type DragDropEvents } from '@dnd-kit-svelte/svelte';
	import { toast } from 'svelte-sonner';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffRow, TeamOption } from '#lib/types/workforce.js';
	import type { PageProps } from './$types';
	import EmployeesTable from './EmployeesTable.svelte';
	import StaffFormSheet from './StaffFormSheet.svelte';
	import TeamTable from './TeamTable.svelte';
	import { ALL_EMPLOYEES, employeeName } from './labels.js';
	import { setPersonalPatternIds } from './context.js';

	let { data }: PageProps = $props();

	const personalPatternIds = $derived(new Set(data.personalPatternIds));
	setPersonalPatternIds(() => personalPatternIds);

	let teamOverrides = $state<Record<string, TeamOption | null>>({});
	let formOpen = $state(false);
	let target = $state<StaffRow | null>(null);

	const employees = $derived(
		data.employees.map((employee) => ({
			...employee,
			team: employee.id in teamOverrides ? teamOverrides[employee.id] : employee.team
		}))
	);

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

	function openCreate() {
		target = null;
		formOpen = true;
	}

	function openEdit(employee: StaffRow) {
		target = employee;
		formOpen = true;
	}

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

	const handleDragEnd: DragDropEvents['dragend'] = (event) => {
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
	};

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
			await invalidateAll();
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
			await invalidateAll();
		};
	};
</script>

<svelte:head>
	<title>{m.employees_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-wrap items-start justify-between gap-4">
	<div class="space-y-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.employees_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.employees_description()}</p>
	</div>
	<Button onclick={openCreate}>
		<PlusIcon data-icon="inline-start" />
		{m.staff_new()}
	</Button>
</section>

<DragDropProvider onDragEnd={handleDragEnd}>
	<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
		<EmployeesTable
			{employees}
			{teamById}
			onEdit={openEdit}
			onToggleActive={toggleActive}
			class="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-var(--header-height)-4rem)]"
		/>

		<section aria-labelledby="teams-heading" class="flex flex-col gap-4">
			<h3 id="teams-heading" class="text-sm font-medium text-muted-foreground">
				{m.employees_teams()}
			</h3>
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
				{#each teams as team (team.id)}
					<TeamTable {team} members={membersByTeam[team.id]} />
				{/each}
			</div>
		</section>
	</div>

	<DragOverlay>
		{#snippet children(source)}
			{@const employee = employeeById.get(source.data?.employeeId)}
			{#if employee}
				<div class="bg-popover px-3 py-2 text-xs font-medium shadow-lg ring-1 ring-foreground/10">
					{employeeName(employee)}
					<bdi dir="ltr" class="ms-2 font-mono text-muted-foreground">{employee.employeeNo}</bdi>
				</div>
			{/if}
		{/snippet}
	</DragOverlay>
</DragDropProvider>

<form bind:this={teamForm} method="POST" action="?/setTeam" use:enhance={onMoveResult} hidden>
	<input type="hidden" name="staffId" value={teamRequest.staffId} />
	<input type="hidden" name="teamId" value={teamRequest.teamId} />
</form>

<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
	<input type="hidden" name="staffId" value={activeRequest.staffId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>

<StaffFormSheet data={data.form} {target} functions={data.functions} {teams} bind:open={formOpen} />
