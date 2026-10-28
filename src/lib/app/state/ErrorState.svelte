<script lang="ts">
	import type { ClassValue } from 'svelte/elements';
	import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import LockKeyIcon from 'phosphor-svelte/lib/LockKeyIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import SignInIcon from 'phosphor-svelte/lib/SignInIcon';
	import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';

	/** `error.message` is already localized and safe: `handleError` shaped it. */
	let { error, class: className }: { error: App.Error; class?: ClassValue } = $props();

	const variant = $derived.by(() => {
		if (error.status === 401) return { title: m.error_title_unauthenticated(), Icon: LockKeyIcon };
		if (error.status === 403) return { title: m.error_title_forbidden(), Icon: LockKeyIcon };
		if (error.status === 404)
			return { title: m.error_title_not_found(), Icon: MagnifyingGlassIcon };
		if (error.status >= 500) return { title: m.error_title_internal(), Icon: WarningCircleIcon };
		return { title: m.error_title_request(), Icon: WarningCircleIcon };
	});
</script>

<div class={['flex items-center justify-center p-4', className]}>
	<Card.Root class="w-full max-w-md">
		<Card.Header class="flex flex-col items-center gap-2 text-center">
			<variant.Icon
				class={['size-10', error.status >= 500 ? 'text-destructive' : 'text-muted-foreground']}
				aria-hidden="true"
			/>
			<p class="text-sm text-muted-foreground">
				<bdi>{m.error_status({ status: error.status })}</bdi>
			</p>
			<Card.Title class="text-xl">{variant.title}</Card.Title>
			<Card.Description>{error.message}</Card.Description>
		</Card.Header>
		<Card.Footer class="flex flex-wrap justify-center gap-2">
			{#if error.status === 401}
				<Button href={localizedHref('/login')}>
					<SignInIcon class="rtl:rotate-180" />
					{m.error_sign_in()}
				</Button>
			{:else}
				<Button variant="outline" href={localizedHref('/dashboard')}>
					<ArrowLeftIcon class="rtl:rotate-180" />
					{m.error_back_dashboard()}
				</Button>
			{/if}
			{#if error.status >= 500}
				<Button onclick={() => invalidateAll()}>
					<ArrowClockwiseIcon />
					{m.error_retry()}
				</Button>
			{/if}
		</Card.Footer>
	</Card.Root>
</div>
