<script lang="ts">
	import ErrorState from '#lib/app/state/ErrorState.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { ErrorProps } from './$types';

	// Catches everything outside the dashboard shell, and errors from the `(dashboard)` layout
	// load itself. Errors from the root layout use `src/error.html` instead.
	let { error }: ErrorProps = $props();
</script>

<svelte:head>
	<title>{error.message} · {m.app_name()}</title>
</svelte:head>

<ErrorState {error} class="min-h-svh" />
