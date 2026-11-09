<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import BriefcaseIcon from 'phosphor-svelte/lib/BriefcaseIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import JobHoldersSheet from '#lib/app/jobs/JobHoldersSheet.svelte';
	import Empty from '#lib/app/state/Empty.svelte';
	import ListItemSheet from '#lib/app/staff-lists/ListItemSheet.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { JobRow } from '#lib/types/jobs.js';
	import { lookupName } from '#lib/utils/locale.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';
	import {
		JOB_STATUSES,
		filterJobs,
		holdersByJob,
		jobStatus,
		jobStatusCounts,
		type JobStatus
	} from '#lib/workforce/jobs.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The status filter lives in `?status=` (JB6); the load doesn't read it, so changing it doesn't
	// refetch. The search stays in the page.
	const status = $derived(jobStatus(page.url.searchParams.get('status')));
	const counts = $derived(jobStatusCounts(data.jobs));
	let query = $state('');
	const visibleJobs = $derived(filterJobs(data.jobs, { query, status }));
	const holders = $derived(holdersByJob(data.holders));

	let statusForm: HTMLFormElement | null = $state(null);

	function statusLabel(value: JobStatus): string {
		const count = counts[value];
		if (value === 'inactive') return m.jobs_status_inactive({ count });
		if (value === 'all') return m.jobs_status_all({ count });
		return m.jobs_status_active({ count });
	}

	/** The job's name in the other language, shown under the current one. */
	function otherName(row: JobRow): { text: string; dir: 'ltr' | 'rtl' } {
		return getLocale() === 'ar'
			? { text: row.nameEn, dir: 'ltr' }
			: { text: row.nameAr, dir: 'rtl' };
	}

	// Create / rename: the shared staff-list sheet (JB8). Its saved message reloads the page.
	let itemOpen = $state(false);
	let itemTarget = $state<JobRow | null>(null);

	function openItem(row: JobRow | null) {
		itemTarget = row;
		itemOpen = true;
	}

	// Who holds a job (JB7).
	let holdersOpen = $state(false);
	let holdersOfId = $state<string | null>(null);
	// From the page data, so a rename or a reload shows up in the open sheet.
	const holdersOf = $derived(data.jobs.find((job) => job.id === holdersOfId) ?? null);

	function openHolders(row: JobRow) {
		holdersOfId = row.id;
		holdersOpen = true;
	}

	// Deactivate / activate through one hidden form (JB4, JB5).
	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ itemId: '', active: 'false' });

	async function setActive(row: JobRow, active: boolean) {
		activeRequest = { itemId: row.id, active: String(active) };
		await tick();
		activeForm?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{m.jobs_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.jobs_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.jobs_description()}</p>
		</div>
		<Button onclick={() => openItem(null)}>
			<PlusIcon data-icon="inline-start" />
			{m.jobs_new()}
		</Button>
	</div>

	<Card.Root>
		<Card.Header class="flex flex-wrap items-center gap-2">
			<InputGroup.Root class="max-w-xs">
				<InputGroup.Input
					type="search"
					bind:value={query}
					placeholder={m.jobs_search_placeholder()}
					aria-label={m.jobs_search_label()}
				/>
				<InputGroup.Addon>
					<MagnifyingGlassIcon />
				</InputGroup.Addon>
			</InputGroup.Root>

			<form
				method="GET"
				bind:this={statusForm}
				data-sveltekit-noscroll
				data-sveltekit-reset="false"
				data-sveltekit-replacestate
			>
				<Select.Root
					type="single"
					name="status"
					value={status}
					onValueChange={async () => {
						// Let the hidden input take the new value first.
						await tick();
						statusForm?.requestSubmit();
					}}
				>
					<Select.Trigger class="w-44" aria-label={m.jobs_status_label()}>
						{statusLabel(status)}
					</Select.Trigger>
					<Select.Content>
						{#each JOB_STATUSES as value (value)}
							<Select.Item {value} label={statusLabel(value)} />
						{/each}
					</Select.Content>
				</Select.Root>
			</form>
		</Card.Header>

		<Card.Content class="px-0">
			{#if visibleJobs.length === 0}
				<Empty icon={BriefcaseIcon} title={m.jobs_empty()} description={m.jobs_empty_hint()} />
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.jobs_col_job()}</Table.Head>
							<Table.Head>{m.jobs_col_people()}</Table.Head>
							<Table.Head>{m.jobs_col_status()}</Table.Head>
							<Table.Head>
								<span class="sr-only">{m.staff_lists_actions({ name: '' })}</span>
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each visibleJobs as row (row.id)}
							{const other = $derived(otherName(row))}
							<Table.Row class={row.active ? undefined : 'text-muted-foreground'}>
								<Table.Cell class="font-medium whitespace-normal">
									<span class="flex flex-col">
										<span>{lookupName(row)}</span>
										<span class="text-xs font-normal text-muted-foreground" dir={other.dir}>
											{other.text}
										</span>
									</span>
								</Table.Cell>
								<Table.Cell>
									<span class="flex flex-wrap items-center gap-2">
										<Button
											variant="ghost"
											size="sm"
											onclick={() => openHolders(row)}
											aria-label={m.jobs_people_open({ name: lookupName(row) })}
										>
											<UsersThreeIcon data-icon="inline-start" />
											{row.activeCount}
										</Button>
										{#if row.inactiveCount > 0}
											<span class="text-xs text-muted-foreground">
												{m.jobs_people_inactive({ count: row.inactiveCount })}
											</span>
										{/if}
									</span>
								</Table.Cell>
								<Table.Cell>
									<Badge variant={row.active ? 'secondary' : 'outline'}>
										{row.active ? m.staff_lists_status_active() : m.staff_lists_status_inactive()}
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
													aria-label={m.staff_lists_actions({ name: lookupName(row) })}
												>
													<DotsThreeIcon />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onSelect={() => openItem(row)}>
												<PencilSimpleIcon />
												{m.staff_lists_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Item onSelect={() => openHolders(row)}>
												<UsersThreeIcon />
												{m.jobs_menu_people()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											{#if row.active}
												<DropdownMenu.Item
													variant="destructive"
													onSelect={() => setActive(row, false)}
												>
													<ProhibitIcon />
													{row.activeCount > 0
														? m.jobs_deactivate_keep({ count: row.activeCount })
														: m.staff_lists_deactivate()}
												</DropdownMenu.Item>
											{:else}
												<DropdownMenu.Item onSelect={() => setActive(row, true)}>
													<CheckCircleIcon />
													{m.staff_lists_activate()}
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</section>

<form
	bind:this={activeForm}
	method="POST"
	action="?/setListItemActive"
	use:enhance={toastNotice}
	hidden
>
	<input type="hidden" name="kind" value="job_title" />
	<input type="hidden" name="itemId" value={activeRequest.itemId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>

<ListItemSheet data={data.listForm} kind="job_title" target={itemTarget} bind:open={itemOpen} />

<JobHoldersSheet
	job={holdersOf}
	holders={holdersOf ? (holders.get(holdersOf.id) ?? []) : []}
	bind:open={holdersOpen}
/>
