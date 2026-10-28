<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { enhance, type SubmitFunction } from '$app/forms';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import UserCheckIcon from 'phosphor-svelte/lib/UserCheckIcon';
	import UsersFourIcon from 'phosphor-svelte/lib/UsersFourIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { shiftKindLetter } from '#lib/app/roster/labels.js';
	import { localizedHref } from '#lib/i18n.js';
	import { personName, teamName } from '#lib/utils/locale.js';
	import TeamFormSheet from './TeamFormSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Team = (typeof data.teams)[number];

	let formOpen = $state(false);
	let target = $state<Team | null>(null);

	function openCreate() {
		target = null;
		formOpen = true;
	}

	function openRename(team: Team) {
		target = team;
		formOpen = true;
	}

	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ teamId: '', active: 'false' });

	async function setActive(team: Team, active: boolean) {
		activeRequest = { teamId: team.id, active: String(active) };
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
	<title>{m.teams_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.teams_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.teams_description()}</p>
		</div>
		<Button onclick={openCreate}>
			<PlusIcon data-icon="inline-start" />
			{m.teams_new()}
		</Button>
	</div>

	<Card.Root>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.teams_col_name()}</Table.Head>
						<Table.Head>{m.teams_col_members()}</Table.Head>
						<Table.Head>{m.teams_col_cycle()}</Table.Head>
						<Table.Head>{m.teams_col_supervisors()}</Table.Head>
						<Table.Head>{m.teams_col_today()}</Table.Head>
						<Table.Head>{m.teams_col_status()}</Table.Head>
						<Table.Head><span class="sr-only">{m.teams_actions({ name: '' })}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.teams as team (team.id)}
						<Table.Row>
							<Table.Cell class="font-medium">
								<a href={localizedHref('/teams/[id]', { id: team.id })} class="hover:underline">
									{teamName(team)}
								</a>
							</Table.Cell>
							<Table.Cell>
								<span class="inline-flex items-center gap-1.5 text-muted-foreground">
									<UsersFourIcon class="size-4" />
									{team.memberCount}
								</span>
							</Table.Cell>
							<Table.Cell>
								{#if team.cycle}
									<bdi class="font-mono text-xs" dir="ltr">
										{team.cycle.map(shiftKindLetter).join(' ')}
									</bdi>
								{:else}
									<span class="text-muted-foreground">{m.teams_no_cycle()}</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-sm">
								{#if team.supervisors.length > 0}
									{team.supervisors.map(personName).join(m.list_separator())}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</Table.Cell>
							<Table.Cell>{team.todayFlights}</Table.Cell>
							<Table.Cell>
								<Badge variant={team.active ? 'secondary' : 'outline'}>
									{team.active ? m.teams_status_active() : m.teams_status_inactive()}
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
												aria-label={m.teams_actions({ name: teamName(team) })}
											>
												<DotsThreeIcon />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item onSelect={() => openRename(team)}>
											<PencilSimpleIcon />
											{m.teams_rename()}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										{#if team.active}
											<DropdownMenu.Item
												variant="destructive"
												onSelect={() => setActive(team, false)}
											>
												<ProhibitIcon />
												{m.teams_deactivate()}
											</DropdownMenu.Item>
										{:else}
											<DropdownMenu.Item onSelect={() => setActive(team, true)}>
												<UserCheckIcon />
												{m.teams_activate()}
											</DropdownMenu.Item>
										{/if}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={7} class="h-20 text-center text-muted-foreground">
								{m.teams_empty()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>

<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
	<input type="hidden" name="teamId" value={activeRequest.teamId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>

<TeamFormSheet data={data.form} {target} bind:open={formOpen} />
