<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';

	let open = $state(false);

	const submitUndo: SubmitFunction = (input) => {
		const after = toastNotice(input);
		return async (options) => {
			open = false;
			if (typeof after === 'function') await after(options);
			else await options.update();
		};
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline">
				<ArrowCounterClockwiseIcon data-icon="inline-start" />
				{m.imports_undo()}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.imports_undo_title()}</Dialog.Title>
			<Dialog.Description>{m.imports_undo_description()}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>
				{m.imports_undo_cancel()}
			</Button>
			<form method="POST" action="?/undo" use:enhance={submitUndo}>
				<Button type="submit" variant="destructive">{m.imports_undo()}</Button>
			</form>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
