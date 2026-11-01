<script lang="ts">
	import { enhance } from '$app/forms';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { ProfileItemKind } from '#lib/schemas/staff-profile.schema.js';
	import { toastNotice } from '#lib/utils/notice-toasts.js';

	type Props = {
		kind: ProfileItemKind;
		itemId: string;
		/** Accessible name, e.g. "Remove contact Sam". */
		label: string;
	};

	let { kind, itemId, label }: Props = $props();
</script>

<!-- Soft removal (profile plan H10): the row stays in the DB and in the audit log. -->
<form method="POST" action="?/removeProfileItem" use:enhance={toastNotice}>
	<input type="hidden" name="kind" value={kind} />
	<input type="hidden" name="itemId" value={itemId} />
	<Button type="submit" variant="ghost" size="icon" aria-label={label}>
		<TrashIcon />
	</Button>
</form>
