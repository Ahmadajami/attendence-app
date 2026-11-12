<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import PunchBatchView from './PunchBatchView.svelte';
	import StaffBatchView from './StaffBatchView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.imports_detail_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-6">
	{#if data.kind === 'punches'}
		<PunchBatchView view={data.view} />
	{:else}
		<StaffBatchView batch={data.batch} />
	{/if}
</section>
