<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { getLocale, getTextDirection } from '#lib/paraglide/runtime.js';
	import type { SessionUser } from '#lib/server/auth/session.js';
	import { dashboardNav } from './nav.js';
	import AppLogo from './AppLogo.svelte';
	import NavMain from './NavMain.svelte';

	let { user, ...restProps }: ComponentProps<typeof Sidebar.Root> & { user: SessionUser } =
		$props();

	const navItems = $derived(
		dashboardNav.filter((item) => !item.permission || user.permissions.includes(item.permission))
	);

	const sidebar = Sidebar.useSidebar();
	// Desktop: `left` is the logical start, so it mirrors under dir="rtl" on its own.
	// Mobile: the Sheet uses physical sides, so pick one from the text direction.
	const rtl = getTextDirection(getLocale()) === 'rtl';
	const side = $derived(sidebar.isMobile ? (rtl ? 'right' : 'left') : undefined);
</script>

<Sidebar.Root collapsible="offcanvas" {...restProps} {side}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<!-- `h-auto`: the button is `h-8` by default, too short for the logo. -->
				<Sidebar.MenuButton class="h-auto data-[slot=sidebar-menu-button]:!p-1.5">
					{#snippet child({ props })}
						<a href={localizedHref('/dashboard')} {...props}>
							<!-- `!`: the menu button sizes every svg inside it to `size-4`. -->
							<AppLogo class="!h-10 !w-auto" />
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={navItems} />
	</Sidebar.Content>
</Sidebar.Root>
