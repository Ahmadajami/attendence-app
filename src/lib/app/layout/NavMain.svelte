<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { deLocalizeHref } from '#lib/paraglide/runtime.js';
	import type { NavItem } from './nav.js';

	let { items }: { items: NavItem[] } = $props();

	const currentPath = $derived(deLocalizeHref(page.url.pathname));
</script>

<Sidebar.Group>
	<Sidebar.GroupContent>
		<Sidebar.Menu aria-label={m.nav_main()}>
			{#each items as item (item.path)}
				{@const active = currentPath === item.path}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={active} tooltipContent={item.label()}>
						{#snippet child({ props })}
							<a
								href={localizedHref(item.path)}
								aria-current={active ? 'page' : undefined}
								{...props}
							>
								<item.icon />
								<span>{item.label()}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
