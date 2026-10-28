<script lang="ts">
	import AuthFive from '#lib/components/efferd/auth/auth-five.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.login_title()} · {m.app_name()}</title>
</svelte:head>

<AuthFive data={data.form} />
