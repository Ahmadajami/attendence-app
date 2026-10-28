<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import DotsSixVerticalIcon from 'phosphor-svelte/lib/DotsSixVerticalIcon';
	import { Button } from '#lib/components/ui/button/index.js';

	let { attach, label }: { attach: Attachment; label: string } = $props();
</script>

<Button
	{@attach attach}
	variant="ghost"
	size="icon"
	class="size-7 cursor-grab text-muted-foreground hover:bg-transparent active:cursor-grabbing"
>
	<DotsSixVerticalIcon class="size-4" weight="bold" />
	<span class="sr-only">{label}</span>
</Button>
