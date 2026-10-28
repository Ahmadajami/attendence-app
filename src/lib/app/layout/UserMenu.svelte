<script lang="ts">
	import ClockIcon from 'phosphor-svelte/lib/ClockIcon';
	import SignOutIcon from 'phosphor-svelte/lib/SignOutIcon';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { SessionUser } from '#lib/server/auth/session.js';
	import { formatDateTime } from '#lib/utils/datetime.js';

	let { user }: { user: SessionUser } = $props();

	const locale = getLocale();
	const name = $derived(locale === 'ar' ? (user.fullNameAr ?? user.fullName) : user.fullName);
	const roleName = $derived(locale === 'ar' ? user.role.nameAr : user.role.nameEn);
	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase()
	);

	const codeExpiry = $derived(
		user.credentialExpiresAt ? formatDateTime(user.credentialExpiresAt) : null
	);

	let logoutForm: HTMLFormElement | null = $state(null);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="gap-2 px-1.5"
				aria-label={m.user_menu_open()}
			>
				<Avatar.Root class="size-6">
					<Avatar.Fallback class="text-xs">{initials}</Avatar.Fallback>
				</Avatar.Root>
				<span class="hidden max-w-40 truncate sm:inline">{name}</span>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-64">
		<DropdownMenu.Label class="flex flex-col gap-1">
			<span class="truncate text-sm font-medium text-foreground">{name}</span>
			<span>{m.user_menu_id()} <bdi>{user.loginId}</bdi></span>
			<Badge variant="secondary" class="mt-1 w-fit">{roleName}</Badge>
		</DropdownMenu.Label>
		{#if codeExpiry}
			<DropdownMenu.Separator />
			<p class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
				<ClockIcon class="size-4 shrink-0" />
				<span>{m.user_code_expires()} <bdi>{codeExpiry}</bdi></span>
			</p>
		{/if}
		<DropdownMenu.Separator />
		<DropdownMenu.Item onSelect={() => logoutForm?.requestSubmit()}>
			<SignOutIcon class="rtl:-scale-x-100" />
			{m.logout()}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<!-- Sign-out is a POST (SvelteKit's origin check protects it); the menu item submits this form. -->
<form bind:this={logoutForm} method="POST" action={localizedHref('/logout')} hidden></form>
