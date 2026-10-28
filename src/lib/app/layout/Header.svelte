<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import AirplaneTiltIcon from 'phosphor-svelte/lib/AirplaneTiltIcon';
	import ListIcon from 'phosphor-svelte/lib/ListIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AnimatedThemeToggler } from '#lib/components/magic/animated-theme-toggler/index.js';
	import { localizedHref, type AppPath } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { deLocalizeHref } from '#lib/paraglide/runtime.js';
	import { cn } from '#lib/utils.js';
	import type { SessionUser } from '#lib/server/auth/session.js';
	import LocaleSwitcher from './LocaleSwitcher.svelte';
	import UserMenu from './UserMenu.svelte';

	let { user }: { user: SessionUser } = $props();

	const navRoutes: { path: AppPath; label: string }[] = [
		{ path: '/', label: m.nav_home() },
		{ path: '/dashboard', label: m.nav_dashboard() }
	];
	const navItems = navRoutes.map((item) => ({ ...item, href: localizedHref(item.path) }));

	const homeHref = localizedHref('/');
	const currentPath = $derived(deLocalizeHref(page.url.pathname));

	const id = $props.id();
	const menuId = `${id}-menu`;
	let menuOpen = $state(false);
	let menuButton: HTMLButtonElement | null = $state(null);

	afterNavigate(() => {
		menuOpen = false;
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && menuOpen) {
			menuOpen = false;
			menuButton?.focus();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<header
	class="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg supports-backdrop-filter:bg-background/60"
>
	<div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
		<a href={homeHref} class="flex shrink-0 items-center gap-2 text-sm font-semibold">
			<AirplaneTiltIcon class="size-5 rtl:-scale-x-100" weight="duotone" />
			<span>{m.app_name()}</span>
		</a>

		<nav aria-label={m.app_name()} class="hidden items-center gap-1 md:flex">
			{#each navItems as item (item.path)}
				<Button
					href={item.href}
					variant="ghost"
					size="sm"
					aria-current={currentPath === item.path ? 'page' : undefined}
					class="text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
				>
					{item.label}
				</Button>
			{/each}
		</nav>

		<div class="ms-auto flex items-center gap-1">
			<LocaleSwitcher />

			<AnimatedThemeToggler
				class="inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
			/>

			<UserMenu {user} />

			<Button
				bind:ref={menuButton}
				variant="ghost"
				size="icon"
				class="md:hidden"
				aria-label={menuOpen ? m.menu_close() : m.menu_open()}
				aria-controls={menuId}
				aria-expanded={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
			>
				{#if menuOpen}
					<XIcon class="size-5" />
				{:else}
					<ListIcon class="size-5" />
				{/if}
			</Button>
		</div>
	</div>

	<nav
		id={menuId}
		aria-label={m.app_name()}
		class={cn('border-t bg-background md:hidden', !menuOpen && 'hidden')}
	>
		<ul class="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
			{#each navItems as item (item.path)}
				<li>
					<a
						href={item.href}
						aria-current={currentPath === item.path ? 'page' : undefined}
						class="block px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
					>
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</header>
