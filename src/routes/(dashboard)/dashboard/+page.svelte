<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.dashboard_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-2">
	<h2 class="text-2xl font-semibold tracking-tight">{m.dashboard_title()}</h2>
	<p class="text-muted-foreground">{m.dashboard_placeholder()}</p>
</section>
