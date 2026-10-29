<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';
	import type { DropTarget } from '#lib/roster/slots.js';

	type Props = {
		id: string;
		/** Draggable types this zone takes (`slot`, `shift`). */
		accept: string[];
		target: DropTarget;
		disabled?: boolean;
		/** Renders the zone's element: `{@attach attach}` it, and style on `active` (a drag is over it). */
		children: Snippet<[{ attach: (node: HTMLElement) => () => void; active: boolean }]>;
	};

	let { id, accept, target, disabled = false, children }: Props = $props();

	const droppable = createDroppable({
		get id() {
			return id;
		},
		get accept() {
			return accept;
		},
		get data() {
			return target;
		},
		get disabled() {
			return disabled;
		}
	});
</script>

{@render children({ attach: droppable.attach, active: droppable.isDropTarget })}
