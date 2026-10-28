<!-- Local RTL edit: logical start/end utilities instead of left/right. Re-apply after regenerating with shadcn-svelte. -->
<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<ul
	bind:this={ref}
	data-slot="sidebar-menu-sub"
	data-sidebar="menu-sub"
	class={cn(
		"border-sidebar-border mx-3.5 translate-x-px rtl:-translate-x-px gap-1 border-s px-2.5 py-0.5 group-data-[collapsible=icon]:hidden flex min-w-0 flex-col",
		"group-data-[collapsible=icon]:hidden",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</ul>
