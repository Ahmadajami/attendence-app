<script lang="ts">
	import ErrorState from '#lib/app/state/ErrorState.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { ErrorProps } from './$types';

	// Page errors under the dashboard render inside the sidebar shell.
	let { error }: ErrorProps = $props();
</script>

<svelte:head>
	<title>{error.message} · {m.app_name()}</title>
</svelte:head>

<ErrorState {error} class="flex-1" />
