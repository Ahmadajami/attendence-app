<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Form from '#lib/components/ui/form/index.js';
	import { m } from '#lib/paraglide/messages.js';

	type Props = {
		/** `true`: a red `*` (and "required" for screen readers); `false`: a muted "(optional)". */
		required: boolean;
		children: Snippet;
		class?: string;
	};

	let { required, children, class: className }: Props = $props();
</script>

<!-- A Formsnap label (use inside Form.Control) that says whether the field must be filled (create
     plan C2). -->
<Form.Label class={className}>
	{@render children()}
	{#if required}
		<span class="text-destructive" aria-hidden="true">*</span>
		<span class="sr-only">{m.form_required()}</span>
	{:else}
		<span class="font-normal text-muted-foreground">{m.form_optional()}</span>
	{/if}
</Form.Label>
