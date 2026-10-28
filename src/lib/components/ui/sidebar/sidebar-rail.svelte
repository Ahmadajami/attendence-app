<!-- Local RTL edit: logical start/end utilities instead of left/right. Re-apply after regenerating with shadcn-svelte. -->
<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import { useSidebar } from "./context.svelte.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> = $props();

	const sidebar = useSidebar();
</script>

<button
	bind:this={ref}
	data-sidebar="rail"
	data-slot="sidebar-rail"
	aria-label="Toggle Sidebar"
	tabindex={-1}
	onclick={sidebar.toggle}
	title="Toggle Sidebar"
	class={cn(
		"hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-end-4 group-data-[side=right]:start-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] sm:flex ltr:-translate-x-1/2 rtl:translate-x-1/2",
		"in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
		"[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
		"rtl:in-data-[side=left]:cursor-e-resize rtl:in-data-[side=right]:cursor-w-resize",
		"rtl:[[data-side=left][data-state=collapsed]_&]:cursor-w-resize rtl:[[data-side=right][data-state=collapsed]_&]:cursor-e-resize",
		"group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:start-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
		"[[data-side=left][data-collapsible=offcanvas]_&]:-end-2",
		"[[data-side=right][data-collapsible=offcanvas]_&]:-start-2",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>
