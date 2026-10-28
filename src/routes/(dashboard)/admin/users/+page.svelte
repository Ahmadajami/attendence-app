<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { enhance, type SubmitFunction } from '$app/forms';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import KeyIcon from 'phosphor-svelte/lib/KeyIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import UserCheckIcon from 'phosphor-svelte/lib/UserCheckIcon';
	import UserSwitchIcon from 'phosphor-svelte/lib/UserSwitchIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatDateTime } from '#lib/utils/datetime.js';
	import ChangeRoleSheet from './ChangeRoleSheet.svelte';
	import CreateAccountSheet from './CreateAccountSheet.svelte';
	import IssueCodeSheet from './IssueCodeSheet.svelte';
	import IssuedCodeCard from './IssuedCodeCard.svelte';
	import { personName, roleName } from './labels.js';
	import type { UsersMessage } from './schema.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Account = (typeof data.accounts)[number];
	type Issued = Extract<UsersMessage, { kind: 'issued' }>;

	let issued = $state<Issued | null>(null);
	let createOpen = $state(false);
	let issueOpen = $state(false);
	let roleOpen = $state(false);
	let issueTarget = $state<Account | null>(null);
	let roleTarget = $state<Account | null>(null);

	type Status = 'inactive' | 'locked' | 'expired' | 'active';

	function statusOf(account: Account): Status {
		if (!account.active) return 'inactive';
		if (account.lockedAt) return 'locked';
		if (account.passwordExpiresAt && account.passwordExpiresAt.getTime() <= Date.now()) {
			return 'expired';
		}
		return 'active';
	}

	const STATUS: Record<
		Status,
		{ label: () => string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
	> = {
		active: { label: m.users_status_active, variant: 'secondary' },
		locked: { label: m.users_status_locked, variant: 'destructive' },
		expired: { label: m.users_status_expired, variant: 'outline' },
		inactive: { label: m.users_status_inactive, variant: 'outline' }
	};

	function onissued(message: Issued) {
		issued = message;
	}

	function openIssue(account: Account) {
		issueTarget = account;
		issueOpen = true;
	}

	function openRole(account: Account) {
		roleTarget = account;
		roleOpen = true;
	}

	// One hidden form posts activate / deactivate for whichever row was chosen.
	let activeForm: HTMLFormElement | null = $state(null);
	let activeRequest = $state({ userId: '', active: 'false' });

	async function setActive(account: Account, active: boolean) {
		activeRequest = { userId: account.id, active: String(active) };
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
	<title>{m.users_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.users_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.users_description()}</p>
		</div>
		<Button onclick={() => (createOpen = true)}>
			<PlusIcon data-icon="inline-start" />
			{m.users_new()}
		</Button>
	</div>

	{#if issued}
		<IssuedCodeCard {...issued} ondismiss={() => (issued = null)} />
	{/if}

	<Card.Root>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.login_id_label()}</Table.Head>
						<Table.Head>{m.users_col_name()}</Table.Head>
						<Table.Head>{m.users_col_role()}</Table.Head>
						<Table.Head>{m.users_col_status()}</Table.Head>
						<Table.Head>{m.users_col_code_expires()}</Table.Head>
						<Table.Head>{m.users_col_last_login()}</Table.Head>
						<Table.Head><span class="sr-only">{m.users_actions({ name: '' })}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.accounts as account (account.id)}
						{@const status = STATUS[statusOf(account)]}
						<Table.Row>
							<Table.Cell class="font-mono"><bdi>{account.loginId}</bdi></Table.Cell>
							<Table.Cell>
								<span class="font-medium">{personName(account)}</span>
								{#if account.isSelf}
									<Badge variant="outline" class="ms-2">{m.users_you()}</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell>{roleName(account.role)}</Table.Cell>
							<Table.Cell><Badge variant={status.variant}>{status.label()}</Badge></Table.Cell>
							<Table.Cell>
								{#if account.passwordExpiresAt}
									<bdi>{formatDateTime(account.passwordExpiresAt)}</bdi>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if account.lastLoginAt}
									<bdi>{formatDateTime(account.lastLoginAt)}</bdi>
								{:else}
									<span class="text-muted-foreground">{m.users_never()}</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-end">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												size="icon"
												aria-label={m.users_actions({ name: personName(account) })}
											>
												<DotsThreeIcon />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										{#if account.active}
											<DropdownMenu.Item onSelect={() => openIssue(account)}>
												<KeyIcon />
												{m.users_issue_code()}
											</DropdownMenu.Item>
										{/if}
										{#if !account.isSelf}
											<DropdownMenu.Item onSelect={() => openRole(account)}>
												<UserSwitchIcon />
												{m.users_change_role()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											{#if account.active}
												<DropdownMenu.Item
													variant="destructive"
													onSelect={() => setActive(account, false)}
												>
													<ProhibitIcon />
													{m.users_deactivate()}
												</DropdownMenu.Item>
											{:else}
												<DropdownMenu.Item onSelect={() => setActive(account, true)}>
													<UserCheckIcon />
													{m.users_activate()}
												</DropdownMenu.Item>
											{/if}
										{/if}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>

<form bind:this={activeForm} method="POST" action="?/setActive" use:enhance={toastNotice} hidden>
	<input type="hidden" name="userId" value={activeRequest.userId} />
	<input type="hidden" name="active" value={activeRequest.active} />
</form>

<CreateAccountSheet data={data.createForm} roles={data.roles} bind:open={createOpen} {onissued} />
<IssueCodeSheet data={data.issueForm} target={issueTarget} bind:open={issueOpen} {onissued} />
<ChangeRoleSheet data={data.roleForm} roles={data.roles} target={roleTarget} bind:open={roleOpen} />
