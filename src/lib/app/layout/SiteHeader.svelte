<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { AnimatedThemeToggler } from '#lib/components/magic/animated-theme-toggler/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { deLocalizeHref } from '#lib/paraglide/runtime.js';
	import { dashboardNav } from './nav.js';
	import type { SessionUser } from '#lib/server/auth/session.js';
	import LocaleSwitcher from './LocaleSwitcher.svelte';
	import UserMenu from './UserMenu.svelte';

	let { user }: { user: SessionUser } = $props();

	const currentPath = $derived(deLocalizeHref(page.url.pathname));
	const title = $derived(
		dashboardNav.find((item) => item.path === currentPath)?.label() ?? m.app_name()
	);
</script>

<header
	class="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)"
>
	<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
		<Sidebar.Trigger class="-ms-1" />
		<Separator orientation="vertical" class="mx-2 data-vertical:h-4 data-vertical:self-auto" />
		<h1 class="text-base font-medium">{title}</h1>
		<div class="ms-auto flex items-center gap-1">
			<LocaleSwitcher />
			<AnimatedThemeToggler
				class="inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
			/>
			<UserMenu {user} />
		</div>
	</div>
</header>
