<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import AppSidebar from '#lib/app/layout/AppSidebar.svelte';
	import SiteHeader from '#lib/app/layout/SiteHeader.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<Sidebar.Provider
	style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
>
	<AppSidebar variant="inset" user={data.user} />
	<Sidebar.Inset>
		<SiteHeader user={data.user} />
		<main class="@container/main flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
