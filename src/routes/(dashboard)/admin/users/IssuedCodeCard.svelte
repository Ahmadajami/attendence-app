<script lang="ts">
	import { toast } from 'svelte-sonner';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import KeyIcon from 'phosphor-svelte/lib/KeyIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatDateTime } from '#lib/utils/datetime.js';

	type Props = {
		fullName: string;
		loginId: string;
		code: string;
		expiresAt: string;
		ondismiss: () => void;
	};

	let { fullName, loginId, code, expiresAt, ondismiss }: Props = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
			toast.success(m.users_copied());
		} catch {
			// Clipboard blocked (e.g. insecure context): the code is still on screen to read out.
		}
	}
</script>

<Card.Root aria-live="polite">
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<KeyIcon class="size-4" />
			{m.users_code_title({ name: fullName })}
		</Card.Title>
		<Card.Description>{m.users_code_hint()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-wrap items-end gap-6">
		<div class="space-y-1">
			<p class="text-xs text-muted-foreground">{m.login_id_label()}</p>
			<p class="font-mono text-lg" dir="ltr">{loginId}</p>
		</div>
		<div class="space-y-1">
			<p class="text-xs text-muted-foreground">{m.login_code_label()}</p>
			<p class="font-mono text-3xl tracking-[0.3em]" dir="ltr">{code}</p>
		</div>
		<div class="space-y-1">
			<p class="text-xs text-muted-foreground">{m.users_code_valid_until()}</p>
			<p class="text-sm"><bdi>{formatDateTime(new Date(expiresAt))}</bdi></p>
		</div>
	</Card.Content>
	<Card.Footer class="gap-2">
		<Button variant="outline" onclick={copy}>
			<CopyIcon data-icon="inline-start" />
			{m.users_copy()}
		</Button>
		<Button onclick={ondismiss}>{m.users_dismiss()}</Button>
	</Card.Footer>
</Card.Root>
